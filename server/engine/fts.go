package engine

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
)

// Full text search over the token/posting index (build/fts.ts). Semantics of the v2 search are kept:
//   - every term is a word pattern: by default a prefix (dhamma -> dhamma*), * and ? are wildcards anywhere
//     (*ssa = suffix, *na* = infix); exact disables the implicit prefix
//   - terms without diacritics match diacritic-insensitively (dhamma ~ dhammā)
//   - several terms: within distance words of each other (any order), in order (order) or adjacent (phrase)
//   - results are grouped by the combination of matched words ("combos") with their frequencies

// FtsQuery are the search parameters.
type FtsQuery struct {
	Terms    []string `json:"terms"`
	Exact    bool     `json:"exact"`
	Phrase   bool     `json:"phrase"`
	Order    bool     `json:"order"`
	Distance int      `json:"distance"`
	Filter   []string `json:"filter"`   // node keys (collections / books) to search in
	Combo    int      `json:"combo"`    // -1 all combos
	Group    string   `json:"group"`    // only the hits in this group (FtsGroup.Key)
	SortFreq bool     `json:"sortFreq"` // groups by number of hits instead of tree order
	Page     int      `json:"page"`
	PageSize int      `json:"pageSize"`
}

// FtsGroup is a text (sutta, chapter ...) with hits of the selected combos (v2: the file list of a match).
type FtsGroup struct {
	Key   string `json:"key"`
	Title string `json:"title"`
	Path  string `json:"path"` // titles of the ancestors below the collection, " › " separated
	Coll  string `json:"coll"`
	Count int    `json:"count"`
	Para  int    `json:"para"` // first hit
}

// Combo is a combination of matched words.
type Combo struct {
	ID    int      `json:"id"`
	Words []string `json:"words"`
	Freq  int      `json:"freq"`
	Books int      `json:"books"`
}

// FtsHit is one occurrence.
type FtsHit struct {
	Combo int    `json:"combo"`
	Book  int    `json:"book"`
	Para  int    `json:"para"`
	Key   string `json:"key"`
	Title string `json:"title"`
	Path  string `json:"path"` // book title
	Offs  []int  `json:"offs"` // token offsets inside the paragraph (may exceed it when a match spans paragraphs)
	Text  string `json:"text"`
}

// FtsResult is the search response.
type FtsResult struct {
	Combos   []Combo    `json:"combos"`
	Total    int        `json:"total"` // occurrences of the selected combos
	Page     int        `json:"page"`
	PageSize int        `json:"pageSize"`
	Hits     []FtsHit   `json:"hits"`
	Groups   []FtsGroup `json:"groups"`
	// more than maxGroups texts matched: only the first ones are listed
	GroupsTruncated bool  `json:"groupsTruncated"`
	Truncated       bool  `json:"truncated"` // limits were hit, results are incomplete
	Tokens          []int `json:"tokens"`    // number of matching words per term
}

const (
	maxTokensPerTerm = 20000
	maxCombos        = 200
	maxOccurrences   = 300000
	maxWork          = 5_000_000
)

// ErrTooBroad is returned when a query would touch too much data.
type ErrTooBroad struct{ Term string }

func (e *ErrTooBroad) Error() string {
	return fmt.Sprintf("the term '%s' is too broad, please refine the query", e.Term)
}

type tokenInfo struct {
	id   int
	w    string
	freq int
}

// glob converts a user pattern to an sqlite GLOB pattern (only * and ? are special, [ ] are dropped).
func glob(p string) string {
	p = strings.NewReplacer("%", "*", "_", "?", "[", "", "]", "").Replace(p)
	for strings.Contains(p, "**") {
		p = strings.ReplaceAll(p, "**", "*")
	}
	return p
}

func literalPrefix(p string) string {
	if i := strings.IndexAny(p, "*?"); i >= 0 {
		return p[:i]
	}
	return p
}

// matchTokens finds the tokens of one term.
func (e *Engine) matchTokens(ctx context.Context, term string, exact bool) ([]tokenInfo, bool, error) {
	t := glob(NormalizeWord(strings.TrimSpace(term)))
	if t == "" || t == "*" {
		return nil, false, &ParamError{"empty search term"}
	}
	if !exact && !strings.ContainsAny(t, "*?") { // implicit prefix only when the user wrote no wildcard
		t += "*"
	}
	sensitive := HasDiacritics(t)
	f := Fold(t)
	var where string
	var args []any
	hasWild := strings.ContainsAny(f, "*?")
	switch {
	case !hasWild:
		where, args = "fold = ?", []any{f}
	case literalPrefix(f) != "":
		where, args = "fold GLOB ?", []any{f}
	case literalPrefix(Reverse(f)) != "":
		where, args = "rev GLOB ?", []any{Reverse(f)}
	default:
		where, args = "fold GLOB ?", []any{f}
	}
	if sensitive {
		where += " AND w GLOB ?"
		args = append(args, t)
	}
	q := "SELECT id, w, freq FROM token WHERE " + where + " ORDER BY freq DESC LIMIT " + strconv.Itoa(maxTokensPerTerm+1)
	rows, err := e.text.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	var out []tokenInfo
	for rows.Next() {
		var ti tokenInfo
		if err := rows.Scan(&ti.id, &ti.w, &ti.freq); err != nil {
			return nil, false, err
		}
		out = append(out, ti)
	}
	truncated := len(out) > maxTokensPerTerm
	if truncated {
		out = out[:maxTokensPerTerm]
	}
	return out, truncated, rows.Err()
}

// occ is one occurrence of a token in a book.
type occ struct {
	off int32
	tok int32 // index into the term's token list
}

func decodeOffsets(b []byte, fn func(int32)) {
	var prev, cur int64
	var shift uint
	for _, x := range b {
		cur |= int64(x&0x7f) << shift
		if x&0x80 != 0 {
			shift += 7
		} else {
			prev += cur
			fn(int32(prev))
			cur, shift = 0, 0
		}
	}
}

func (e *Engine) bookAllowed(book int, filter []string) bool {
	if len(filter) == 0 {
		return true
	}
	for _, a := range e.bookAnc[book] {
		for _, f := range filter {
			if a == f {
				return true
			}
		}
	}
	// a filter below the book root (e.g. a single sutta) - the book contains it
	for _, f := range filter {
		if i, ok := e.byKey[f]; ok && e.nodes[i].Book == book {
			return true
		}
	}
	return false
}

// postings loads the occurrences of the tokens per book, only for books in allowed (nil = all).
func (e *Engine) postings(ctx context.Context, toks []tokenInfo, allowed map[int]bool) (map[int][]occ, error) {
	out := map[int][]occ{}
	idx := make(map[int]int32, len(toks))
	for i, t := range toks {
		idx[t.id] = int32(i)
	}
	const chunk = 500
	for s := 0; s < len(toks); s += chunk {
		end := min(s+chunk, len(toks))
		ph := strings.Repeat(",?", end-s)[1:]
		args := make([]any, 0, end-s)
		for _, t := range toks[s:end] {
			args = append(args, t.id)
		}
		rows, err := e.text.QueryContext(ctx, "SELECT token_id, book_id, offsets FROM posting WHERE token_id IN ("+ph+")", args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var tid, book int
			var blob []byte
			if err := rows.Scan(&tid, &book, &blob); err != nil {
				rows.Close()
				return nil, err
			}
			if allowed != nil && !allowed[book] {
				continue
			}
			ti := idx[tid]
			list := out[book]
			decodeOffsets(blob, func(o int32) { list = append(list, occ{o, ti}) })
			out[book] = list
		}
		rows.Close()
		if err := ctx.Err(); err != nil {
			return nil, err
		}
	}
	for b := range out {
		l := out[b]
		sort.Slice(l, func(i, j int) bool { return l[i].off < l[j].off })
	}
	return out, nil
}

type ftsMatch struct {
	book int
	offs []int32
	toks []int32 // token index per term
}

// Fts runs a search.
func (e *Engine) Fts(ctx context.Context, q FtsQuery) (*FtsResult, error) {
	if len(q.Terms) == 0 || len(q.Terms) > 8 {
		return nil, &ParamError{"between 1 and 8 terms are needed"}
	}
	if q.Distance <= 0 {
		q.Distance = 10
	}
	if q.PageSize == 0 || q.PageSize > 200 { // -1: combos and groups only (api pageSize=0)
		q.PageSize = 50
	}
	cacheKey := fmt.Sprintf("%q|%v|%v|%v|%d|%q", q.Terms, q.Exact, q.Phrase, q.Order, q.Distance, q.Filter)
	var base *ftsBase
	if v, ok := e.ftsCache.get(cacheKey); ok {
		base = v.(*ftsBase)
	} else {
		var err error
		if base, err = e.ftsCompute(ctx, q); err != nil {
			return nil, err
		}
		e.ftsCache.put(cacheKey, base)
	}
	return e.ftsPage(ctx, base, q)
}

type ftsBase struct {
	combos    []Combo
	matches   [][]ftsMatch // per combo, in book order
	truncated bool
	tokens    []int
}

func (e *Engine) ftsCompute(ctx context.Context, q FtsQuery) (*ftsBase, error) {
	nt := len(q.Terms)
	terms := make([][]tokenInfo, nt)
	base := &ftsBase{tokens: make([]int, nt)}
	var mu sync.Mutex
	var firstErr error
	var wg sync.WaitGroup
	for i, t := range q.Terms {
		wg.Add(1)
		go func(i int, t string) {
			defer wg.Done()
			toks, trunc, err := e.matchTokens(ctx, t, q.Exact)
			mu.Lock()
			defer mu.Unlock()
			if err != nil && firstErr == nil {
				firstErr = err
			}
			terms[i] = toks
			base.tokens[i] = len(toks)
			base.truncated = base.truncated || trunc
		}(i, t)
	}
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	for _, t := range terms {
		if len(t) == 0 {
			base.combos = []Combo{}
			return base, nil
		}
	}
	// books allowed by the filter
	var allowed map[int]bool
	if len(q.Filter) > 0 {
		allowed = map[int]bool{}
		for b := range e.books {
			if e.bookAllowed(b, q.Filter) {
				allowed[b] = true
			}
		}
	}
	// load the rarest term first and restrict the other terms to its books
	order := make([]int, nt)
	for i := range order {
		order[i] = i
	}
	freq := func(i int) int {
		s := 0
		for _, t := range terms[i] {
			s += t.freq
		}
		return s
	}
	sort.Slice(order, func(a, b int) bool { return freq(order[a]) < freq(order[b]) })
	occs := make([]map[int][]occ, nt)
	for k, ti := range order {
		if total := freq(ti); total > maxOccurrences*4 && nt > 1 {
			return nil, &ErrTooBroad{q.Terms[ti]}
		}
		m, err := e.postings(ctx, terms[ti], allowed)
		if err != nil {
			return nil, err
		}
		occs[ti] = m
		if k == 0 && nt > 1 {
			allowed = map[int]bool{}
			for b := range m {
				allowed[b] = true
			}
		}
	}
	// books containing every term
	var books []int
	for b := range occs[order[0]] {
		ok := true
		for t := 0; t < nt; t++ {
			if len(occs[t][b]) == 0 {
				ok = false
				break
			}
		}
		if ok {
			books = append(books, b)
		}
	}
	sort.Ints(books)

	comboIdx := map[string]int{}
	var combos []Combo
	var matches [][]ftsMatch
	comboBooks := []map[int]bool{}
	work := 0
	total := 0
	add := func(book int, offs, toks []int32) {
		var kb strings.Builder
		for _, t := range toks {
			kb.WriteString(strconv.Itoa(int(t)))
			kb.WriteByte(',')
		}
		key := kb.String()
		ci, ok := comboIdx[key]
		if !ok {
			ci = len(combos)
			comboIdx[key] = ci
			words := make([]string, nt)
			for t := range toks {
				words[t] = terms[t][toks[t]].w
			}
			combos = append(combos, Combo{ID: ci, Words: words})
			matches = append(matches, nil)
			comboBooks = append(comboBooks, map[int]bool{})
		}
		combos[ci].Freq++
		comboBooks[ci][book] = true
		matches[ci] = append(matches[ci], ftsMatch{book, append([]int32(nil), offs...), append([]int32(nil), toks...)})
		total++
	}
	for _, b := range books {
		if total >= maxOccurrences || work > maxWork {
			base.truncated = true
			break
		}
		lists := make([][]occ, nt)
		for t := 0; t < nt; t++ {
			lists[t] = occs[t][b]
		}
		offs := make([]int32, nt)
		toks := make([]int32, nt)
		var rec func(t int, lo, hi int32)
		rec = func(t int, lo, hi int32) {
			if t == nt {
				add(b, offs, toks)
				return
			}
			l := lists[t]
			i := sort.Search(len(l), func(k int) bool { return l[k].off >= lo })
			for ; i < len(l) && l[i].off <= hi; i++ {
				work++
				o := l[i].off
				dup := false
				for p := 0; p < t; p++ {
					if offs[p] == o {
						dup = true
						break
					}
				}
				if dup {
					continue
				}
				offs[t], toks[t] = o, l[i].tok
				minO, maxO := offs[0], offs[0]
				for p := 1; p <= t; p++ {
					minO, maxO = min(minO, offs[p]), max(maxO, offs[p])
				}
				var nlo, nhi int32
				switch {
				case q.Phrase:
					nlo, nhi = o+1, o+1
				case q.Order:
					nlo, nhi = maxO+1, minO+int32(q.Distance)
				default:
					nlo, nhi = maxO-int32(q.Distance), minO+int32(q.Distance)
				}
				rec(t+1, nlo, nhi)
				if total >= maxOccurrences || work > maxWork {
					return
				}
			}
		}
		rec(0, 0, 1<<31-1)
	}
	if work > maxWork || total >= maxOccurrences {
		base.truncated = true
	}
	for i := range combos {
		combos[i].Books = len(comboBooks[i])
	}
	// most frequent combos first, keep maxCombos
	idx := make([]int, len(combos))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool { return combos[idx[a]].Freq > combos[idx[b]].Freq })
	if len(idx) > maxCombos {
		idx = idx[:maxCombos]
		base.truncated = true
	}
	base.combos = make([]Combo, len(idx))
	base.matches = make([][]ftsMatch, len(idx))
	for k, i := range idx {
		c := combos[i]
		c.ID = k
		base.combos[k] = c
		base.matches[k] = matches[i]
	}
	return base, nil
}

const maxGroups = 2000

func (e *Engine) ftsPage(ctx context.Context, base *ftsBase, q FtsQuery) (*FtsResult, error) {
	res := &FtsResult{Combos: base.combos, Page: q.Page, PageSize: q.PageSize, Hits: []FtsHit{}, Groups: []FtsGroup{}, Truncated: base.truncated, Tokens: base.tokens}
	type ref struct {
		combo int
		m     *ftsMatch
		para  int
		tok   int32
		group int
	}
	var sel []ref
	for ci := range base.matches {
		if q.Combo >= 0 && q.Combo != ci {
			continue
		}
		for k := range base.matches[ci] {
			sel = append(sel, ref{combo: ci, m: &base.matches[ci][k]})
		}
	}
	// tree order: books are numbered in tree order, then position
	sort.SliceStable(sel, func(a, b int) bool {
		ma, mb := sel[a].m, sel[b].m
		if ma.book != mb.book {
			return ma.book < mb.book
		}
		return minOff(ma.offs) < minOff(mb.offs)
	})
	// paragraph and group of every occurrence
	counts := map[int]*FtsGroup{}
	var order []int
	for i := range sel {
		bp, err := e.bookParas(ctx, sel[i].m.book)
		if err != nil {
			return nil, err
		}
		p := bp.paraOf(minOff(sel[i].m.offs))
		sel[i].para, sel[i].tok = p, bp.tok[p]
		g := e.groupNode[bp.node[p]]
		sel[i].group = g
		if c, ok := counts[g]; ok {
			c.Count++
		} else {
			n := e.nodes[g]
			counts[g] = &FtsGroup{Key: n.Key, Title: n.Title, Path: e.groupPath(g), Coll: n.Coll, Count: 1, Para: p}
			order = append(order, g)
		}
	}
	for _, g := range order {
		res.Groups = append(res.Groups, *counts[g])
	}
	if q.SortFreq {
		sort.SliceStable(res.Groups, func(a, b int) bool { return res.Groups[a].Count > res.Groups[b].Count })
	}
	if len(res.Groups) > maxGroups {
		res.Groups = res.Groups[:maxGroups]
		res.GroupsTruncated = true
	}
	if q.Group != "" {
		gi, ok := e.byKey[q.Group]
		if !ok {
			return nil, &ParamError{"unknown group"}
		}
		kept := sel[:0]
		for _, r := range sel {
			if r.group == gi {
				kept = append(kept, r)
			}
		}
		sel = kept
	}
	res.Total = len(sel)
	start := min(q.Page*max(q.PageSize, 0), len(sel))
	end := min(start+max(q.PageSize, 0), len(sel))
	for _, r := range sel[start:end] {
		h := FtsHit{Combo: r.combo, Book: r.m.book, Para: r.para, Path: e.books[r.m.book].Title}
		for _, o := range r.m.offs {
			h.Offs = append(h.Offs, int(o-r.tok))
		}
		var nodeID int
		if err := e.text.QueryRowContext(ctx, "SELECT node_id, text FROM para WHERE id = ?", r.m.book*paraIDShift+r.para).Scan(&nodeID, &h.Text); err != nil {
			return nil, err
		}
		h.Key, h.Title = e.nodes[nodeID].Key, e.nodes[nodeID].Title
		res.Hits = append(res.Hits, h)
	}
	return res, nil
}

// groupPath: titles of the ancestors of a group below the collection root
func (e *Engine) groupPath(id int) string {
	var parts []string
	for p := e.nodes[id].Parent; p >= 0 && e.nodes[p].Parent >= 0; p = e.nodes[p].Parent {
		parts = append(parts, e.nodes[p].Title)
	}
	for l, r := 0, len(parts)-1; l < r; l, r = l+1, r-1 {
		parts[l], parts[r] = parts[r], parts[l]
	}
	return strings.Join(parts, " › ")
}

func minOff(o []int32) int32 {
	m := o[0]
	for _, x := range o[1:] {
		m = min(m, x)
	}
	return m
}

// bookParaInfo: the first token offset and the node of every paragraph of a book
type bookParaInfo struct {
	tok  []int32
	node []int32
}

// paraOf finds the paragraph of a book token offset. Empty paragraphs share the offset of the next one:
// the last paragraph starting at or before off is the one holding the token.
func (b *bookParaInfo) paraOf(off int32) int {
	i := sort.Search(len(b.tok), func(k int) bool { return b.tok[k] > off }) - 1
	return max(i, 0)
}

func (e *Engine) bookParas(ctx context.Context, book int) (*bookParaInfo, error) {
	e.tokMu.Lock()
	defer e.tokMu.Unlock()
	if t, ok := e.paraTok[book]; ok {
		return t, nil
	}
	rows, err := e.text.QueryContext(ctx, "SELECT tok, node_id FROM para WHERE id >= ? AND id < ? ORDER BY id", book*paraIDShift, (book+1)*paraIDShift)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := &bookParaInfo{}
	for rows.Next() {
		var t, n int32
		if err := rows.Scan(&t, &n); err != nil {
			return nil, err
		}
		out.tok = append(out.tok, t)
		out.node = append(out.node, n)
	}
	if len(out.tok) == 0 {
		return nil, sql.ErrNoRows
	}
	e.paraTok[book] = out
	return out, rows.Err()
}
