package engine

import (
	"os"
	"testing"
	"time"
)

// TIPITAKA_DB=../../db go test -run TestFullCorpus -v ./engine/ : timings of typical and broad queries
func TestFullCorpus(t *testing.T) {
	if os.Getenv("TIPITAKA_DB") == "" {
		t.Skip("set TIPITAKA_DB to the full db folder")
	}
	e := fixture(t)
	for _, q := range []FtsQuery{
		{Terms: []string{"bhikkhave"}, Exact: true},
		{Terms: []string{"dhamma"}},
		{Terms: []string{"*ssa"}},
		{Terms: []string{"*na*"}},
		{Terms: []string{"evaṃ", "me", "sutaṃ"}, Phrase: true, Exact: true},
		{Terms: []string{"bhagavā", "bhikkhū"}, Distance: 10},
		{Terms: []string{"a*", "*a"}, Distance: 3},
	} {
		q.Combo = -1
		start := time.Now()
		r, err := e.Fts(ctx, q)
		if err != nil {
			t.Logf("%v: %v (%v)", q.Terms, err, time.Since(start))
			continue
		}
		t.Logf("%-28v %8v combos=%d total=%d truncated=%v tokens=%v", q.Terms, time.Since(start).Round(time.Millisecond), len(r.Combos), r.Total, r.Truncated, r.Tokens)
	}
	for _, w := range []string{"dhammassa", "bhikkhave", "paṭiccasamuppāda", "anattā"} {
		start := time.Now()
		r, err := e.Lookup(ctx, w, nil, 10)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("lookup %-20s %v dpd=%d entries=%d", w, time.Since(start).Round(time.Millisecond), len(r.Dpd), len(r.Entries))
	}
	start := time.Now()
	h, _ := e.Titles(ctx, "sutta", nil, 100)
	t.Logf("titles sutta %v %d", time.Since(start), len(h))
	start = time.Now()
	c, _ := e.Text(ctx, "dn-2-3", -1, 0)
	t.Logf("text dn-2-3 %v %d paras", time.Since(start), len(c.Paras))
}
