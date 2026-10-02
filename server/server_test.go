package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

const testIndex = `<!doctype html><html lang="en"><head><title>x</title><meta name="description" content="d"></head><body><div id="app"></div></body></html>`

func testApp(t testing.TB) *App {
	t.Helper()
	app, err := NewApp(Config{Root: "..", DBDir: filepath.Join("..", "e2e", "fixtures", "db"), Site: "https://tipitaka.app", IndexHTML: testIndex})
	if err != nil {
		t.Fatalf("fixture dbs (npm run build:fixture && npm run build:dict:fixture): %v", err)
	}
	return app
}

func get(t *testing.T, h http.Handler, url string) (*http.Response, string) {
	t.Helper()
	req := httptest.NewRequest("GET", url, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	res := rec.Result()
	b, _ := io.ReadAll(res.Body)
	return res, string(b)
}

func TestAPI(t *testing.T) {
	h := testApp(t).Handler()
	res, body := get(t, h, "/api/node?key=dn-1-1")
	if res.StatusCode != 200 || !strings.Contains(body, `"title":"1. Brahmajālasuttaṃ"`) {
		t.Fatalf("node %d %s", res.StatusCode, body)
	}
	if res.Header.Get("ETag") == "" || !strings.Contains(res.Header.Get("Cache-Control"), "max-age") {
		t.Fatalf("cache headers %v", res.Header)
	}
	for url, status := range map[string]int{
		"/api/node?key=nope":            404,
		"/api/nope":                     404,
		"/api/text?key=dn-1-1&from=abc": 400,
		"/api/fts?q=*":                  400,
		"/api/fts?q=bhikkhave":          200,
		"/api/dict?w=dhamma":            200,
		"/api/lookup?w=dhammassa":       200,
		"/api/titles?q=brahma":          200,
		"/api/children?key=":            200,
		"/api/links?key=dn-1-1":         200,
		"/api/meta":                     200,
		"/api/health":                   200,
	} {
		if res, body := get(t, h, url); res.StatusCode != status {
			t.Errorf("%s: %d (want %d) %s", url, res.StatusCode, status, body[:min(200, len(body))])
		}
	}
	// the old arbitrary sql endpoint is gone
	req := httptest.NewRequest("POST", "/sql-query", strings.NewReader(`{"query":"select 1"}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code == 200 && strings.Contains(rec.Body.String(), "1") && !strings.Contains(rec.Body.String(), "<html") {
		t.Fatal("/sql-query must not exist")
	}
	// POST with json params
	req = httptest.NewRequest("POST", "/api/text", strings.NewReader(`{"key":"dn-1-1","from":3,"count":2}`))
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var chunk struct{ From, To int }
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &chunk) != nil || chunk.From != 3 || chunk.To != 5 {
		t.Fatalf("post text %d %s", rec.Code, rec.Body.String())
	}
}

func TestSSR(t *testing.T) {
	h := testApp(t).Handler()
	res, body := get(t, h, "/latn/dn-1-1")
	if res.StatusCode != 200 {
		t.Fatal(res.StatusCode)
	}
	for _, want := range []string{
		`<title>1. Brahmajālasuttaṃ – Sīlakkhandhavaggapāḷi | Tipiṭaka.app</title>`,
		`<link rel="canonical" href="https://tipitaka.app/latn/dn-1-1">`,
		`hreflang="pi-Thai" href="https://tipitaka.app/thai/dn-1-1"`,
		`<html lang="pi-Latn">`,
		`<article id="ssr"`,
		`Evaṃ me sutaṃ`,
		`id="ssr-data"`,
		`"node|{\"key\":\"dn-1-1\"}"`,
		`application/ld+json`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("ssr missing %q", want)
		}
	}
	if strings.Contains(body, `content="d"`) {
		t.Error("default description not replaced")
	}
	// other scripts are converted
	_, thai := get(t, h, "/thai/dn-1-1")
	if strings.Contains(thai, "Evaṃ me sutaṃ") || !strings.Contains(thai, `lang="pi-Thai"`) {
		t.Error("thai page not converted")
	}
	// bare key is served (canonical latn), unknown keys are 404, reserved routes 200
	if res, body := get(t, h, "/dn-1-1"); res.StatusCode != 200 || !strings.Contains(body, "/latn/dn-1-1") {
		t.Errorf("bare key %d", res.StatusCode)
	}
	for url, status := range map[string]int{"/latn/nope": 404, "/latn/search": 200, "/sinh/dict/dhamma": 200, "/sinh/dict": 200, "/": 200, "/latn": 200, "/x.js": 404} {
		if res, _ := get(t, h, url); res.StatusCode != status {
			t.Errorf("%s: %d want %d", url, res.StatusCode, status)
		}
	}
}

func TestLegacyRedirect(t *testing.T) {
	h := testApp(t).Handler()
	req := httptest.NewRequest("GET", "/?a=aa1-4-si", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 301 || !strings.HasPrefix(rec.Header().Get("Location"), "/sinh/dn-1-1") {
		t.Fatalf("legacy redirect %d %q", rec.Code, rec.Header().Get("Location"))
	}
}

func TestSitemapRobots(t *testing.T) {
	h := testApp(t).Handler()
	if res, body := get(t, h, "/sitemap.xml"); res.StatusCode != 200 || !strings.Contains(body, "sitemaps/thai.xml") {
		t.Fatal("sitemap index")
	}
	if _, body := get(t, h, "/sitemaps/latn.xml"); !strings.Contains(body, "https://tipitaka.app/latn/dn-1-1</loc>") || strings.Contains(body, "/latn/dn-1-1-3<") {
		t.Fatal("sitemap must list suttas but not sections")
	}
	if res, _ := get(t, h, "/sitemaps/nope.xml"); res.StatusCode != 404 {
		t.Fatal("unknown sitemap")
	}
	if _, body := get(t, h, "/robots.txt"); !strings.Contains(body, "Sitemap: https://tipitaka.app/sitemap.xml") {
		t.Fatal("robots")
	}
}

func TestMarkup(t *testing.T) {
	id := func(s string) string { return s }
	cases := map[string]string{
		"a **b** c":             "a <b>b</b> c",
		"a {b **c**} d":         `a <span class="note">[b <b>c</b>]</span> d`,
		"x|M1.0001|y <z>":       "xy &lt;z&gt;",
		"a **b":                 "a <b>b</b>",
		"a {b":                  `a <span class="note">[b]</span>`,
		"a | b":                 "a | b",
	}
	for in, want := range cases {
		if got := markupToHTML(in, id); got != want {
			t.Errorf("%q: %q want %q", in, got, want)
		}
	}
	if got := plainText("Evaṃ |M1.0001| me **sutaṃ** {x}"); got != "Evaṃ me sutaṃ" {
		t.Error(got)
	}
}

func FuzzSSRPath(f *testing.F) {
	app := testApp(f)
	for _, s := range []string{"/latn/dn-1-1", "/", "/thai/", "//", "/latn/../x", "/%00", "/sinh/dict/x"} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, p string) {
		_ = app.renderPath(t.Context(), p)
	})
}
