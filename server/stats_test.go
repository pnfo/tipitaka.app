package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const testGeo = `0.0.0.0,0.255.255.255,ZZ
1.0.0.0,1.0.0.255,AU
1.0.1.0,1.255.255.255,LK
2.0.0.0,255.255.255.255,ZZ
::,2001:db7:ffff:ffff:ffff:ffff:ffff:ffff,ZZ
2001:db8::,2001:db8:ffff:ffff:ffff:ffff:ffff:ffff,TH
2001:db9::,ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff,ZZ
`

func TestGeo(t *testing.T) {
	path := filepath.Join(t.TempDir(), "country.csv")
	os.WriteFile(path, []byte(testGeo), 0o644)
	g, err := loadGeo(path)
	if err != nil {
		t.Fatal(err)
	}
	for ip, want := range map[string]string{"1.0.0.7": "AU", "1.0.1.0": "LK", "1.200.3.4": "LK", "8.8.8.8": "", "0.1.2.3": "",
		"2001:db8::1": "TH", "::ffff:1.0.0.9": "AU", "2001:db9::1": ""} {
		if got := g.country(netip.MustParseAddr(ip)); got != want {
			t.Errorf("%s: %q, want %q", ip, got, want)
		}
	}
	if (*geoDB)(nil).country(netip.MustParseAddr("1.0.0.7")) != "" {
		t.Error("no database: no country")
	}

	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "203.0.113.5:4000"
	r.Header.Set("X-Real-IP", "1.0.0.7")
	if clientIP(r).String() != "203.0.113.5" {
		t.Error("X-Real-IP is only trusted from nginx on this machine")
	}
	r.RemoteAddr = "127.0.0.1:4000"
	if clientIP(r).String() != "1.0.0.7" {
		t.Error("X-Real-IP through nginx")
	}
}

func TestStats(t *testing.T) {
	dir := t.TempDir()
	geo := filepath.Join(dir, "country.csv")
	os.WriteFile(geo, []byte(testGeo), 0o644)
	app := testApp(t)
	if err := app.stats.start(filepath.Join(dir, "metrics.db"), geo, "secret"); err != nil {
		t.Fatal(err)
	}
	for deadline := time.Now().Add(5 * time.Second); app.stats.geo.Load() == nil && time.Now().Before(deadline); {
		time.Sleep(10 * time.Millisecond)
	}
	h := app.Handler()
	const browser = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36"
	do := func(method, url, ua, body string) (*http.Response, string) {
		req := httptest.NewRequest(method, url, strings.NewReader(body))
		req.RemoteAddr = "127.0.0.1:5000"
		req.Header.Set("X-Real-IP", "1.0.1.9") // LK
		req.Header.Set("User-Agent", ua)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		b, _ := io.ReadAll(rec.Result().Body)
		return rec.Result(), string(b)
	}

	if _, body := do("GET", "/api/country", browser, ""); !strings.Contains(body, `"country":"LK"`) {
		t.Fatalf("country: %s", body)
	}
	visit := `{"visit":{"new":true,"day":true,"week":true,"month":true,"script":"sinh","lang":"si"},
		"pages":{"read":3,"search":1,"nonsense":5},"terms":[["search","  Dhamma   Cakka "],["titles","metta"],["bogus","x"]],
		"ops":{"text":2,"lookup":1,"meta":4,"drop_table":1},"words":["Dhammo"]}`
	if res, _ := do("POST", "/api/beacon", browser, visit); res.StatusCode != 204 {
		t.Fatal(res.StatusCode)
	}
	do("POST", "/api/beacon", browser, `{"visit":{"new":false,"day":true,"week":false,"month":false}}`)
	do("POST", "/api/beacon", "Googlebot/2.1", visit) // a crawler api request, not a visit
	do("GET", "/api/text?key=dn-1-1", browser, "")    // people's requests come in the beacons
	do("GET", "/api/text?key=dn-1-1", "Googlebot/2.1", "")
	do("GET", "/latn/dn-1-1", "Googlebot/2.1", "")
	do("GET", "/sitemap.xml", "bingbot/2.0", "")
	app.stats.save()

	counts := map[string]int64{}
	rows, err := app.stats.db.Query(`SELECT metric, value, country, n FROM counts`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var m, v, c string
		var n int64
		rows.Scan(&m, &v, &c, &n)
		counts[m+"|"+v+"|"+c] = n
	}
	rows.Close()
	for k, want := range map[string]int64{
		"visit|new|LK": 1, "visit|returning|LK": 1, "users|day|LK": 2, "users|week|LK": 1, "users|month|LK": 1,
		"script|sinh|": 1, "lang|si|": 1, "page|read|LK": 3, "page|search|LK": 1, "search|search|LK": 1, "search|titles|LK": 1,
		"term:search|dhamma cakka|": 1, "term:titles|metta|": 1, "api|text|LK": 2, "api|lookup|LK": 1, "term:lookup|dhammo|": 1,
		"crawler|api|": 2, "crawler|page|": 1, "crawler|sitemap|": 1,
	} {
		if counts[k] != want {
			t.Errorf("%s: %d, want %d", k, counts[k], want)
		}
	}
	for k := range counts {
		if strings.Contains(k, "nonsense") || strings.Contains(k, "bogus") || strings.Contains(k, "meta") || strings.Contains(k, "drop_table") {
			t.Errorf("only the known pages and searches are counted: %s", k)
		}
	}

	if res, _ := do("GET", "/stats", browser, ""); res.StatusCode != 401 {
		t.Fatalf("stats without the password: %d", res.StatusCode)
	}
	req := httptest.NewRequest("GET", "/stats?by=month", nil)
	req.SetBasicAuth("me", "secret")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	page := rec.Body.String()
	for _, want := range []string{"unique visitors", "🇱🇰 LK", "dhamma cakka", "dhammo", "texts", "full text search"} {
		if rec.Code != 200 || !strings.Contains(page, want) {
			t.Errorf("stats page: %d, no %q", rec.Code, want)
		}
	}
}
