package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// FULL=1 go test -run TestSSRAllKeys . : renders every key of the full db (Roman) and a sample in Sinhala
func TestSSRAllKeys(t *testing.T) {
	if os.Getenv("FULL") == "" {
		t.Skip("set FULL=1 (needs db/text.db)")
	}
	app, err := NewApp(Config{Root: "..", DBDir: filepath.Join("..", "db"), IndexHTML: testIndex})
	if err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	var slowest time.Duration
	slowKey := ""
	keys := app.eng.Keys()
	for i, k := range keys {
		t0 := time.Now()
		p := app.renderPath(context.Background(), "/latn/"+k)
		if d := time.Since(t0); d > slowest {
			slowest, slowKey = d, k
		}
		if p.status != 200 || !strings.Contains(p.html, `<article id="ssr"`) {
			t.Fatalf("%s: status %d", k, p.status)
		}
		if i%200 == 0 {
			if p := app.renderPath(context.Background(), "/sinh/"+k); p.status != 200 {
				t.Fatalf("sinh %s: %d", k, p.status)
			}
		}
	}
	t.Logf("%d keys in %v, slowest %s %v", len(keys), time.Since(start), slowKey, slowest)
}
