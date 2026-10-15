package engine

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// tests run on the fixture dbs: npm run build:fixture && npm run build:dict:fixture
func fixture(t testing.TB) *Engine {
	t.Helper()
	dir := os.Getenv("TIPITAKA_DB")
	if dir == "" {
		dir = filepath.Join("..", "..", "e2e", "fixtures", "db")
	}
	e, err := Open(dir)
	if err != nil {
		t.Fatalf("open fixture dbs (run npm run build:fixture && npm run build:dict:fixture): %v", err)
	}
	t.Cleanup(e.Close)
	return e
}

var ctx = context.Background()

func TestTree(t *testing.T) {
	e := fixture(t)
	roots, err := e.Children("")
	if err != nil || len(roots) != 4 || roots[0].Key != "mula" {
		t.Fatalf("roots %v %v", roots, err)
	}
	info, err := e.Info("dn-1-1")
	if err != nil {
		t.Fatal(err)
	}
	if info.Title != "1. Brahmajālasuttaṃ" || len(info.Path) != 4 || info.Path[3].Key != "dn-1" || info.Next != "dn-1-2" {
		t.Fatalf("info %+v", info)
	}
	if len(info.Commentary) != 1 || info.Commentary[0].Key != "atta-dn-1-1" {
		t.Fatalf("commentary %+v", info.Commentary)
	}
	if _, err := e.Info("nope"); err != ErrNotFound {
		t.Fatalf("want not found, got %v", err)
	}
}

func TestText(t *testing.T) {
	e := fixture(t)
	c, err := e.Text(ctx, "dn-1-1-2", -1, 0)
	if err != nil {
		t.Fatal(err)
	}
	if c.Paras[0].Text != "Cūḷasīlaṃ" || c.Paras[0].Node != "dn-1-1-2" || c.Nodes[0].Key != "dn-1-1-2" {
		t.Fatalf("chunk %+v", c.Paras[0])
	}
	if c.To-c.From != len(c.Paras) {
		t.Fatalf("range %d-%d has %d paras", c.From, c.To, len(c.Paras))
	}
	big, _ := e.Text(ctx, "dn-1", 0, 100000)
	if len(big.Paras) != maxTextCount && len(big.Paras) != big.Book.ParaCount {
		t.Fatalf("count not capped: %d", len(big.Paras))
	}
	if _, err := e.Text(ctx, "dn", -1, 0); err == nil {
		t.Fatal("groups have no text")
	}
}

func TestLinks(t *testing.T) {
	e := fixture(t)
	links, err := e.Links(ctx, "dn-1-1", -1, -1)
	if err != nil {
		t.Fatal(err)
	}
	back := 0
	for _, l := range links {
		if !l.Forward && strings.HasPrefix(l.Key, "atta-dn-1-1") {
			back++
		}
	}
	if back == 0 {
		t.Fatalf("no commentary links into dn-1-1: %v", links)
	}
}

func TestTitles(t *testing.T) {
	e := fixture(t)
	hits, err := e.Titles(ctx, "brahmajala", nil, 10)
	if err != nil || len(hits) == 0 || hits[0].Key != "dn-1-1" {
		t.Fatalf("titles %v %v", hits, err)
	}
	hits, _ = e.Titles(ctx, "brahmajāla", []string{"atta"}, 10)
	for _, h := range hits {
		if h.Coll != "atta" {
			t.Fatalf("collection filter: %v", h)
		}
	}
	if hits, _ := e.Titles(ctx, "brahmajala", []string{"atta"}, 10); len(hits) == 0 {
		t.Fatal("diacritic insensitive title search")
	}
}

func TestFts(t *testing.T) {
	e := fixture(t)
	r, err := e.Fts(ctx, FtsQuery{Terms: []string{"bhikkhave"}, Exact: true, Combo: -1})
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Combos) != 1 || r.Combos[0].Words[0] != "bhikkhave" || r.Total == 0 || r.Total != r.Combos[0].Freq {
		t.Fatalf("combos %+v total %d", r.Combos, r.Total)
	}
	h := r.Hits[0]
	toks := tokenize(h.Text)
	if h.Offs[0] >= len(toks) || toks[h.Offs[0]] != "bhikkhave" {
		t.Fatalf("hit offset %d does not point to the word in %q (%v)", h.Offs[0], h.Text, toks)
	}
	// prefix (default) finds more forms, diacritic insensitive
	p, _ := e.Fts(ctx, FtsQuery{Terms: []string{"dhamma"}, Combo: -1})
	words := map[string]bool{}
	for _, c := range p.Combos {
		words[c.Words[0]] = true
	}
	if !words["dhammaṃ"] || !words["dhammā"] {
		t.Fatalf("prefix/fold search: %v", words)
	}
	// suffix
	s, _ := e.Fts(ctx, FtsQuery{Terms: []string{"*ssa"}, Combo: -1})
	for _, c := range s.Combos {
		if !strings.HasSuffix(Fold(c.Words[0]), "ssa") { // no diacritics typed: tassā matches too
			t.Fatalf("suffix: %v", c.Words)
		}
	}
	if len(s.Combos) == 0 {
		t.Fatal("no suffix matches")
	}
	// phrase
	ph, _ := e.Fts(ctx, FtsQuery{Terms: []string{"evaṃ", "me", "sutaṃ"}, Phrase: true, Exact: true, Combo: -1})
	if ph.Total == 0 {
		t.Fatal("phrase not found")
	}
	for _, h := range ph.Hits {
		if h.Offs[1] != h.Offs[0]+1 || h.Offs[2] != h.Offs[1]+1 {
			t.Fatalf("phrase offsets %v", h.Offs)
		}
	}
	// filter
	f, _ := e.Fts(ctx, FtsQuery{Terms: []string{"bhikkhave"}, Exact: true, Filter: []string{"atta"}, Combo: -1})
	for _, h := range f.Hits {
		if !strings.HasPrefix(h.Key, "atta-") {
			t.Fatalf("filter: %v", h.Key)
		}
	}
	// paging
	pg, _ := e.Fts(ctx, FtsQuery{Terms: []string{"dhamma"}, Combo: -1, Page: 1, PageSize: 5})
	if pg.Total > 5 && len(pg.Hits) == 0 {
		t.Fatal("page 1 empty")
	}
	if _, err := e.Fts(ctx, FtsQuery{Terms: []string{"*"}}); ErrorCode(err) != "bad_request" {
		t.Fatalf("want bad_request, got %v", err)
	}
}

// tokenize is a minimal copy of shared/tokenize.ts for tests (notes skipped, quotes join letters)
func tokenize(text string) []string {
	var out []string
	var cur []rune
	depth := 0
	rs := []rune(text)
	for i := 0; i < len(rs); i++ {
		r := rs[i]
		switch {
		case r == '{':
			depth++
			if len(cur) > 0 {
				out = append(out, string(cur))
				cur = nil
			}
		case r == '}':
			depth--
		case depth > 0:
		case r == '*':
		case r == '|':
			for i++; i < len(rs) && rs[i] != '|'; i++ {
			}
		case isLetter(r):
			cur = append(cur, r)
		case (r == '’' || r == '‘' || r == '\'') && len(cur) > 0 && i+1 < len(rs):
			j := i
			for j < len(rs) && (rs[j] == '’' || rs[j] == '‘' || rs[j] == '\'') {
				j++
			}
			if j < len(rs) && isLetter(rs[j]) {
				i = j - 1
				continue
			}
			out = append(out, string(cur))
			cur = nil
		default:
			if len(cur) > 0 {
				out = append(out, string(cur))
				cur = nil
			}
		}
	}
	if len(cur) > 0 {
		out = append(out, string(cur))
	}
	for i := range out {
		out[i] = NormalizeWord(out[i])
	}
	return out
}

func TestDict(t *testing.T) {
	e := fixture(t)
	r, err := e.Dictionary(ctx, "dhamma", nil, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Entries) == 0 || r.Entries[0].Dist != 0 {
		t.Fatalf("entries %v", r.Entries)
	}
	if len(r.Dpd) == 0 {
		t.Fatal("no dpd headwords for dhamma")
	}
	only, _ := e.Dictionary(ctx, "dhamma", []string{"en-pts"}, 50)
	for _, x := range only.Entries {
		if x.Dict != "en-pts" {
			t.Fatalf("dict filter %v", x.Dict)
		}
	}
	l, err := e.Lookup(ctx, "dhammassa", nil, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(l.Dpd) == 0 || !strings.HasPrefix(l.Dpd[0].Lemma, "dhamma") || len(l.Grammar) == 0 {
		t.Fatalf("lookup %+v", l)
	}
	if l.Dpd[0].Root == nil {
		t.Fatal("root info")
	}
}

func TestQueryJSON(t *testing.T) {
	e := fixture(t)
	var res struct {
		Ok    *NodeInfo `json:"ok"`
		Error string    `json:"error"`
	}
	if err := json.Unmarshal([]byte(e.QueryJSON(`{"op":"node","key":"dn-1-1"}`)), &res); err != nil || res.Ok == nil || res.Ok.Key != "dn-1-1" {
		t.Fatalf("query json %+v %v", res, err)
	}
	if err := json.Unmarshal([]byte(e.QueryJSON(`{"op":"text","key":"dn-1-1","from":5,"count":2}`)), &map[string]any{}); err != nil {
		t.Fatal(err)
	}
	out := e.QueryJSON(`{"op":"nope"}`)
	if !strings.Contains(out, `"not_found"`) {
		t.Fatal(out)
	}
	if out := e.QueryJSON(`not json`); !strings.Contains(out, "bad_request") {
		t.Fatal(out)
	}
}

func TestNormalize(t *testing.T) {
	cases := map[string]string{"Dhammā": "dhamma", "ñāṇaṃ": "nanam", "ṭhānaṃ ḍ ḷ ṅ": "thanam d l n"}
	for in, want := range cases {
		if got := Fold(in); got != want {
			t.Errorf("Fold(%q) = %q want %q", in, got, want)
		}
	}
	if Levenshtein("dhamma", "dhammā") != 1 || Levenshtein("", "abc") != 3 {
		t.Error("levenshtein")
	}
}

func TestLegacyMissing(t *testing.T) {
	e := fixture(t)
	if _, err := e.Legacy(ctx, "zz9", 1); err != ErrNotFound {
		t.Fatalf("legacy %v", err)
	}
}

func TestFtsGroups(t *testing.T) {
	e := fixture(t)
	r, err := e.Fts(ctx, FtsQuery{Terms: []string{"bhikkhave"}, Exact: true, Combo: 0})
	if err != nil {
		t.Fatal(err)
	}
	sum := 0
	for _, g := range r.Groups {
		sum += g.Count
		if strings.Contains(g.Key, "dn-1-1-") {
			t.Fatalf("sections must roll up to the sutta: %s %s", g.Key, g.Title)
		}
	}
	if len(r.Groups) == 0 || sum != r.Total {
		t.Fatalf("groups %d sum %d total %d", len(r.Groups), sum, r.Total)
	}
	g := r.Groups[0]
	one, _ := e.Fts(ctx, FtsQuery{Terms: []string{"bhikkhave"}, Exact: true, Combo: 0, Group: g.Key})
	if one.Total != g.Count || len(one.Hits) == 0 || one.Hits[0].Para != g.Para {
		t.Fatalf("group filter: total %d want %d", one.Total, g.Count)
	}
	byFreq, _ := e.Fts(ctx, FtsQuery{Terms: []string{"bhikkhave"}, Exact: true, Combo: 0, SortFreq: true})
	for i := 1; i < len(byFreq.Groups); i++ {
		if byFreq.Groups[i].Count > byFreq.Groups[i-1].Count {
			t.Fatal("sortFreq")
		}
	}
	if _, err := e.Fts(ctx, FtsQuery{Terms: []string{"bhikkhave"}, Combo: 0, Group: "nope"}); ErrorCode(err) != "bad_request" {
		t.Fatal("unknown group")
	}
}

func TestFtsNoHits(t *testing.T) {
	e := fixture(t)
	r, err := e.Call(ctx, "fts", MapParams{"q": "bhikkhave", "pageSize": "0"})
	if err != nil {
		t.Fatal(err)
	}
	res := r.(*FtsResult)
	if len(res.Hits) != 0 || len(res.Groups) == 0 || res.Total == 0 {
		t.Fatalf("pageSize=0: hits %d groups %d", len(res.Hits), len(res.Groups))
	}
}
