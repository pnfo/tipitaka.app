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
	// only the first 9 scripts of the menu are offered to search engines (sitemaps, hreflang)
	if _, body := get(t, h, "/sitemap.xml"); strings.Count(body, "<sitemap>") != 18 || !strings.Contains(body, "sitemaps/tibt.xml") || strings.Contains(body, "sitemaps/brah.xml") {
		t.Fatalf("sitemap index scripts: %s", body)
	}
	if res, _ := get(t, h, "/sitemaps/brah.xml"); res.StatusCode != 404 {
		t.Fatal("no sitemap for scripts not offered to search engines")
	}
	if res, body := get(t, h, "/brah/dn-1-1"); res.StatusCode != 200 || !strings.Contains(body, `<article id="ssr"`) || strings.Count(body, `rel="alternate" hreflang=`) != 10 || strings.Contains(body, `hreflang="pi-Brah"`) {
		t.Fatalf("other scripts still render, with the hreflang of the 9: %d", strings.Count(body, `rel="alternate" hreflang=`))
	}
	if _, body := get(t, h, "/robots.txt"); !strings.Contains(body, "Sitemap: https://tipitaka.app/sitemap.xml") {
		t.Fatal("robots")
	}
}

func TestMarkup(t *testing.T) {
	id := func(s string) string { return s }
	cases := map[string]string{
		"a **b** c":       "a <b>b</b> c",
		"a {b **c**} d":   `a <span class="note">[b <b>c</b>]</span> d`,
		"x|M1.0001|y <z>": "xy &lt;z&gt;",
		"a **b":           "a <b>b</b>",
		"a {b":            `a <span class="note">[b]</span>`,
		"a | b":           "a | b",
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

func TestSSRNames(t *testing.T) {
	h := testApp(t).Handler()
	res, body := get(t, h, "/latn/names/rajagaha")
	if res.StatusCode != 200 {
		t.Fatal(res.StatusCode)
	}
	for _, want := range []string{
		`<title>Rājagaha – Place | Tipiṭaka.app</title>`,
		`<link rel="canonical" href="https://tipitaka.app/latn/names/rajagaha">`,
		`hreflang="pi-Sinh" href="https://tipitaka.app/sinh/names/rajagaha"`,
		`"@type":"Place"`, `"@type":"GeoCoordinates"`,
		`<h1>Rājagaha</h1>`,
		`<a href="/latn/dn-1-1#p`, // Brahmajālasuttaṃ, taught between Rājagaha and Nāḷandā
		`"entity|{\"slug\":\"rajagaha\"}"`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("name page missing %q", want)
		}
	}
	if res, _ := get(t, h, "/latn/names/nope"); res.StatusCode != 404 {
		t.Errorf("unknown name: %d", res.StatusCode)
	}
	if _, body := get(t, h, "/sinh/names"); !strings.Contains(body, `<a href="/sinh/names/rajagaha">`) {
		t.Error("names index: no link to rajagaha")
	}
	if res, body := get(t, h, "/latn/map"); res.StatusCode != 200 || !strings.Contains(body, `<a href="/latn/names/rajagaha">`) {
		t.Error("map page")
	}
	if _, body := get(t, h, "/latn/dict/dhamma"); !strings.Contains(body, `<title>dhamma – Pāḷi dictionary | Tipiṭaka.app</title>`) || !strings.Contains(body, `"dict|{\"limit\":\"100\",\"w\":\"dhamma\"}"`) {
		t.Error("dictionary page")
	}
	// a text page says where it was taught
	if _, body := get(t, h, "/latn/dn-1-1"); !strings.Contains(body, `"contentLocation":[{"@type":"Place"`) {
		t.Error("text page: no contentLocation")
	}
	if _, body := get(t, h, "/sitemap.xml"); !strings.Contains(body, "sitemaps/names-thai.xml") {
		t.Error("sitemap index: no names sitemap")
	}
	if _, body := get(t, h, "/sitemaps/names-latn.xml"); !strings.Contains(body, "https://tipitaka.app/latn/names/rajagaha</loc>") || !strings.Contains(body, "/latn/map</loc>") {
		t.Error("names sitemap")
	}
}

func TestLoadGuard(t *testing.T) {
	app := testApp(t)
	h := app.Handler()
	// a page rendered before the server gets busy stays in the cache
	if res, _ := get(t, h, "/latn/dn-1-1"); res.StatusCode != 200 {
		t.Fatal(res.StatusCode)
	}
	for i := 0; i < ssrSlots; i++ { // every render slot taken
		app.guard.ssr.ch <- struct{}{}
	}
	defer func() {
		for i := 0; i < ssrSlots; i++ {
			app.guard.ssr.release()
		}
	}()
	page := func(ua, url string) (*http.Response, string) {
		req := httptest.NewRequest("GET", url, nil)
		req.Header.Set("User-Agent", ua)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		b, _ := io.ReadAll(rec.Result().Body)
		return rec.Result(), string(b)
	}
	const person = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36"
	const googlebot = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
	if res, body := page(googlebot, "/latn/dn-1-2"); res.StatusCode != 503 || res.Header.Get("Retry-After") == "" || strings.Contains(body, "ssr") {
		t.Errorf("busy, crawler: %d %q", res.StatusCode, res.Header.Get("Retry-After"))
	}
	if res, body := page(person, "/latn/dn-1-2"); res.StatusCode != 200 || strings.Contains(body, `<article id="ssr"`) || !strings.Contains(body, `<div id="app">`) {
		t.Errorf("busy, person: %d (want the app shell)", res.StatusCode)
	}
	if res, body := page(googlebot, "/latn/dn-1-1"); res.StatusCode != 200 || !strings.Contains(body, `<article id="ssr"`) {
		t.Errorf("busy, cached page: %d", res.StatusCode)
	}
	for i := 0; i < apiSlots; i++ {
		app.guard.api.ch <- struct{}{}
	}
	defer func() {
		for i := 0; i < apiSlots; i++ {
			app.guard.api.release()
		}
	}()
	// (apiWait: the request waits for a slot first)
	if res, body := page(person, "/api/fts?q=dhamma"); res.StatusCode != 503 || !strings.Contains(body, `"busy"`) {
		t.Errorf("busy search: %d %s", res.StatusCode, body)
	}
	if res, body := page(person, "/api/node?key=dn-1-1"); res.StatusCode != 200 {
		t.Errorf("light api ops are not limited: %d %s", res.StatusCode, body)
	}
	if _, body := get(t, h, "/api/health"); !strings.Contains(body, `"shedBots":1`) || !strings.Contains(body, `"shedPeople":1`) || !strings.Contains(body, `"apiBusy":1`) {
		t.Errorf("health load counters: %s", body)
	}
	if _, body := get(t, h, "/robots.txt"); strings.Contains(body, "Crawl-delay") {
		t.Error("robots: no crawl-delay")
	}
	browser := httptest.NewRequest("GET", "/", nil)
	browser.Header.Set("User-Agent", person)
	if !isBot(httptest.NewRequest("GET", "/", nil)) || isBot(browser) {
		t.Error("isBot")
	}
}

func TestNamesLang(t *testing.T) {
	h := testApp(t).Handler()
	var en, si struct {
		Meaning      string `json:"meaning"`
		MeaningLocal string `json:"meaningLocal"`
		FamilyLocal  string `json:"familyLocal"`
		Homonyms     []struct {
			MeaningLocal string `json:"meaningLocal"`
		} `json:"homonyms"`
	}
	_, body := get(t, h, "/api/entity?slug=rajagaha")
	if err := json.Unmarshal([]byte(body), &en); err != nil || en.Meaning == "" || en.MeaningLocal != "" {
		t.Fatalf("english: %v %+v", err, en)
	}
	// the description in the interface language, the English kept (data/names/i18n/si)
	_, body = get(t, h, "/api/entity?slug=rajagaha&lang=si")
	if err := json.Unmarshal([]byte(body), &si); err != nil || si.Meaning != en.Meaning || si.MeaningLocal == "" || si.FamilyLocal == "" {
		t.Fatalf("sinhala: %v %+v", err, si)
	}
}
