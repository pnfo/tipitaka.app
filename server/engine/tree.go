package engine

import (
	"context"
	"sort"
	"strings"
)

// NodeInfo is a node with its breadcrumb and related nodes.
type NodeInfo struct {
	Node
	Path       []Node `json:"path"`       // root .. parent
	Commentary []Node `json:"commentary"` // nodes commenting on this one (atta of a mula node, tika of an atta node)
	MirrorNode *Node  `json:"mirrorNode,omitempty"`
	BookTitle  string `json:"bookTitle,omitempty"`
	ParaCount  int    `json:"paraCount"`
}

// Children returns the children of key ("" = the collection roots).
func (e *Engine) Children(key string) ([]Node, error) {
	var ids []int
	if key == "" {
		for i, n := range e.nodes {
			if n.Parent < 0 {
				ids = append(ids, i)
			}
		}
	} else {
		i, ok := e.byKey[key]
		if !ok {
			return nil, ErrNotFound
		}
		ids = e.children[i]
	}
	out := make([]Node, len(ids))
	for k, i := range ids {
		out[k] = e.nodes[i]
	}
	return out, nil
}

// Info returns the node with its path and related nodes.
func (e *Engine) Info(key string) (*NodeInfo, error) {
	n, err := e.node(key)
	if err != nil {
		return nil, err
	}
	info := &NodeInfo{Node: *n, Path: e.path(n.ID), Commentary: []Node{}}
	for _, c := range e.mirrored[n.ID] {
		info.Commentary = append(info.Commentary, e.nodes[c])
	}
	if n.Mirror != "" {
		if m, err := e.node(n.Mirror); err == nil {
			mc := *m
			info.MirrorNode = &mc
		}
	}
	if n.Book >= 0 && n.Book < len(e.books) {
		info.BookTitle = e.books[n.Book].Title
		info.ParaCount = e.books[n.Book].ParaCount
	}
	return info, nil
}

func (e *Engine) path(id int) []Node {
	var p []Node
	for i := e.nodes[id].Parent; i >= 0; i = e.nodes[i].Parent {
		p = append(p, e.nodes[i])
	}
	for l, r := 0, len(p)-1; l < r; l, r = l+1, r-1 {
		p[l], p[r] = p[r], p[l]
	}
	return p
}

// TitleHit is a title search result.
type TitleHit struct {
	Node
	Parent string `json:"parent"` // title of the parent
	BookT  string `json:"bookTitle"`
}

// Titles finds nodes whose title contains q (diacritic-insensitive unless q has diacritics), titles starting
// with q first, then in tree order. filter limits the search to the nodes below these keys (collections
// mula / atta / tika / anya, pitaka groups vp / atta-sp ..., books); empty = everything.
func (e *Engine) Titles(ctx context.Context, q string, filter []string, limit int) ([]TitleHit, error) {
	q = strings.TrimSpace(strings.ToLower(q))
	if len([]rune(q)) < 2 {
		return []TitleHit{}, nil
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	sensitive := HasDiacritics(q)
	fq := Fold(q)
	allowed := e.underKeys(filter)
	type scored struct {
		id    int
		score int
	}
	var hits []scored
	for i := range e.nodes {
		n := &e.nodes[i]
		if n.Kind == "group" || (allowed != nil && !allowed(i)) {
			continue
		}
		// (pos is a byte offset into the string searched: the lower case title is longer than the folded one)
		title, needle := n.fold, fq
		if sensitive {
			title, needle = strings.ToLower(n.Title), q
		}
		pos := strings.Index(title, needle)
		if pos < 0 {
			continue
		}
		score := 2
		// start of the title (ignoring a leading number "12. ")
		t := strings.TrimLeft(title, "0123456789.() ")
		if pos == 0 || strings.HasPrefix(t, needle) {
			score = 0
		} else if title[pos-1] == ' ' {
			score = 1
		}
		hits = append(hits, scored{i, score})
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
	}
	sort.SliceStable(hits, func(a, b int) bool { return hits[a].score < hits[b].score })
	if len(hits) > limit {
		hits = hits[:limit]
	}
	out := make([]TitleHit, len(hits))
	for k, h := range hits {
		n := e.nodes[h.id]
		out[k] = TitleHit{Node: n}
		if n.Parent >= 0 {
			out[k].Parent = e.nodes[n.Parent].Title
		}
		if n.Book >= 0 {
			out[k].BookT = e.books[n.Book].Title
		}
	}
	return out, nil
}

// SitemapNodes lists the keys of the pages worth indexing: books, divs, and headings that are numbered or
// have children (suttas, vaggas, chapters) - not the small sections inside a sutta, which are part of its page.
func (e *Engine) SitemapNodes() []string {
	var out []string
	for _, n := range e.nodes {
		switch n.Kind {
		case "book", "div":
			out = append(out, n.Key)
		case "heading":
			t := strings.TrimLeft(n.Title, "(")
			if n.Children > 0 || (t != "" && t[0] >= '0' && t[0] <= '9') {
				out = append(out, n.Key)
			}
		}
	}
	return out
}

// underKeys returns a test for "node is one of the keys or below one of them" (nil when keys is empty).
func (e *Engine) underKeys(keys []string) func(id int) bool {
	if len(keys) == 0 {
		return nil
	}
	set := map[int]bool{}
	for _, k := range keys {
		if i, ok := e.byKey[k]; ok {
			set[i] = true
		}
	}
	memo := make(map[int]bool, 1024)
	var under func(id int) bool
	under = func(id int) bool {
		if v, ok := memo[id]; ok {
			return v
		}
		v := set[id] || (e.nodes[id].Parent >= 0 && under(e.nodes[id].Parent))
		memo[id] = v
		return v
	}
	return under
}
