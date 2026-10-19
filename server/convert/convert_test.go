package convert

import (
	"encoding/json"
	"os"
	"sync"
	"testing"
	"time"
)

// golden.json is written by `npx vitest run shared` (shared/converter.test.ts) with the outputs of the
// JavaScript converter of the web app (npm), so Go SSR (the Go port in server/pali-converter) and the web app convert
// identically.
func TestGolden(t *testing.T) {
	b, err := os.ReadFile("golden.json")
	if err != nil {
		t.Skip("golden.json missing - run npm test first")
	}
	var cases []struct {
		In     string            `json:"in"`
		Script map[string]string `json:"out"`
	}
	if err := json.Unmarshal(b, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		for s, want := range c.Script {
			got, err := Convert(c.In, s)
			if err != nil {
				t.Fatal(err)
			}
			if got != want {
				t.Errorf("%s %q:\n got %q\nwant %q", s, c.In, got, want)
			}
		}
	}
}

func TestConcurrentAndSpeed(t *testing.T) {
	text := "Evaṃ me sutaṃ – ekaṃ samayaṃ bhagavā antarā ca rājagahaṃ antarā ca nāḷandaṃ addhānamaggappaṭipanno hoti mahatā bhikkhusaṅghena saddhiṃ pañcamattehi bhikkhusatehi. "
	big := ""
	for i := 0; i < 200; i++ {
		big += text
	}
	start := time.Now()
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := Convert(big, "sinh"); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	t.Logf("8 x %d chars in %v", len([]rune(big)), time.Since(start))
	if out, _ := Convert("Bhagavā", "latn"); out != "Bhagavā" {
		t.Fatal("roman must be unchanged")
	}
	if _, err := Convert("x", "nope"); err == nil {
		t.Fatal("unknown script")
	}
}
