package main

// Usage statistics of the website: anonymous daily counts, nothing about a single visitor.
//   - the web app sends beacons (web/src/composables/stats.ts), only once the visitor taps, clicks or types (crawlers
//     that run the app, ~50 "new visitors" every few minutes on 2026-10-22, never do): whether the visitor is new and
//     whether this is their first visit of the day / week / month (so the unique visitors of a week are a sum), their
//     script and language; when the page is hidden the pages opened, the searches made (the last query of each), the
//     app's requests to the server (the features used) and the words tapped in texts;
//   - the server counts the requests of crawlers;
//   - the country comes from the address (geo.go); the address itself is not kept.
// Counts are rows (day, metric, value, country, n) of a sqlite db (-metrics), saved every minute and on exit.
// /stats shows them by week or month (stats_page.go). The apps send nothing.

import (
	"database/sql"
	"encoding/json"
	"flag"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unicode/utf8"

	_ "github.com/mattn/go-sqlite3"
	"tipitaka.app/server/convert"
	"tipitaka.app/server/engine"
)

var (
	metricsPath = flag.String("metrics", "", "sqlite db for the usage statistics (empty: none)")
	geoPath     = flag.String("geoip", "", "DB-IP country csv(.gz) for /api/country and the statistics")
)

const maxKeys = 50000 // distinct counts kept between two saves (a flood of made up search terms is dropped)

type countKey struct{ day, metric, value, country string }

type stats struct {
	geo      atomic.Pointer[geoDB]
	db       *sql.DB // nil: no counting
	password string  // of /stats (STATS_PASSWORD; empty: no /stats)
	mu       sync.Mutex
	counts   map[countKey]int64
}

func newStats() *stats { return &stats{counts: map[countKey]int64{}} }

// start opens the metrics db and loads the country db (in the background: the server answers meanwhile).
func (s *stats) start(metrics, geo, password string) error {
	s.password = password
	if geo != "" {
		go func() {
			t := time.Now()
			g, err := loadGeo(geo)
			if err != nil {
				log.Printf("geoip: %v", err)
				return
			}
			s.geo.Store(g)
			log.Printf("geoip: %d + %d ranges in %v", len(g.v4), len(g.v6), time.Since(t).Round(time.Millisecond))
		}()
	}
	if metrics == "" {
		return nil
	}
	db, err := sql.Open("sqlite3", "file:"+metrics+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return err
	}
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, metric TEXT NOT NULL, value TEXT NOT NULL,
		country TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, metric, value, country)) WITHOUT ROWID`); err != nil {
		return err
	}
	s.db = db
	go func() {
		for range time.Tick(time.Minute) {
			s.save()
		}
	}()
	go func() { // systemctl restart / stop: keep the last minute
		ch := make(chan os.Signal, 1)
		signal.Notify(ch, syscall.SIGTERM, syscall.SIGINT)
		<-ch
		s.save()
		os.Exit(0)
	}()
	return nil
}

func (s *stats) add(metric, value, country string, n int64) {
	if s == nil || s.db == nil || value == "" || n <= 0 {
		return
	}
	k := countKey{time.Now().UTC().Format("2006-01-02"), metric, value, country}
	s.mu.Lock()
	if _, ok := s.counts[k]; ok || len(s.counts) < maxKeys {
		s.counts[k] += n
	}
	s.mu.Unlock()
}

// save adds the counts since the last save to the db.
func (s *stats) save() {
	s.mu.Lock()
	counts := s.counts
	s.counts = map[countKey]int64{}
	s.mu.Unlock()
	if len(counts) == 0 {
		return
	}
	err := func() error {
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		defer tx.Rollback()
		st, err := tx.Prepare(`INSERT INTO counts VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET n = n + excluded.n`)
		if err != nil {
			return err
		}
		for k, n := range counts {
			if _, err := st.Exec(k.day, k.metric, k.value, k.country, n); err != nil {
				return err
			}
		}
		return tx.Commit()
	}()
	if err != nil {
		log.Printf("stats: %v", err)
	}
}

func (s *stats) country(r *http.Request) string { return s.geo.Load().country(clientIP(r)) }

// count is the middleware counting the requests of crawlers (people's are in the beacons).
func (s *stats) count(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r)
		if s.db == nil || !isBot(r) {
			return
		}
		path := r.URL.Path
		switch {
		case strings.HasPrefix(path, "/api/"):
			s.add("crawler", "api", "", 1)
		case strings.Contains(path, "sitemap") || path == "/robots.txt":
			s.add("crawler", "sitemap", "", 1)
		case !strings.Contains(path[strings.LastIndex(path, "/")+1:], "."): // not a file of the web app
			s.add("crawler", "page", "", 1)
		}
	})
}

func normTerm(q string) string {
	q = strings.ToLower(strings.Join(strings.Fields(q), " "))
	for utf8.RuneCountInString(q) > 60 {
		_, n := utf8.DecodeLastRuneInString(q)
		q = q[:len(q)-n]
	}
	return q
}

// the web app's route names (web/src/router.ts) and search kinds, interface languages (web/src/i18n)
var (
	beaconPages = map[string]bool{"home": true, "read": true, "search": true, "titles": true, "dict": true, "bookmarks": true,
		"settings": true, "about": true, "help": true, "convert": true, "names": true, "map": true, "notfound": true}
	beaconSearches = map[string]bool{"search": true, "titles": true, "dict": true}
	uiLangs        = map[string]bool{"en": true, "si": true, "my": true, "th": true, "kh": true, "hi": true, "ch": true}
)

type beacon struct {
	Visit *struct {
		New, Day, Week, Month bool
		Script, Lang          string
	} `json:"visit"`
	Pages map[string]int64 `json:"pages"`
	Terms [][2]string      `json:"terms"` // [search kind, query]
	Ops   map[string]int64 `json:"ops"`   // the app's requests to the server (engine ops)
	Words []string         `json:"words"` // tapped in texts (op lookup)
}

var beaconOps = func() map[string]bool {
	m := map[string]bool{}
	for _, op := range engine.Ops {
		m[op] = op != "meta"
	}
	return m
}()

// handleBeacon: POST /api/beacon from the web app (sendBeacon, text/plain json).
func (s *stats) handleBeacon(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
	var b beacon
	body, _ := io.ReadAll(io.LimitReader(r.Body, 8<<10))
	if s.db == nil || isBot(r) || json.Unmarshal(body, &b) != nil {
		return
	}
	c := s.country(r)
	if v := b.Visit; v != nil {
		kind := "returning"
		if v.New {
			kind = "new"
		}
		s.add("visit", kind, c, 1)
		for period, first := range map[string]bool{"day": v.Day, "week": v.Week, "month": v.Month} {
			if first {
				s.add("users", period, c, 1)
			}
		}
		if v.Day { // the scripts and languages of the day's visitors
			if convert.IsScript(v.Script) {
				s.add("script", v.Script, "", 1)
			}
			if uiLangs[v.Lang] {
				s.add("lang", v.Lang, "", 1)
			}
		}
	}
	for p, n := range b.Pages {
		if beaconPages[p] {
			s.add("page", p, c, min(n, 200))
		}
	}
	for op, n := range b.Ops {
		if beaconOps[op] {
			s.add("api", op, c, min(n, 500))
		}
	}
	for i, w := range b.Words {
		if i == 50 {
			break
		}
		s.add("term:lookup", normTerm(w), "", 1)
	}
	for i, t := range b.Terms {
		if i == 20 {
			break
		}
		if q := normTerm(t[1]); beaconSearches[t[0]] && q != "" {
			s.add("search", t[0], c, 1)
			s.add("term:"+t[0], q, "", 1)
		}
	}
}

// handleCountry: GET /api/country, the visitor's country for the first visit's defaults.
func (s *stats) handleCountry(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]string{"country": s.country(r)})
}

func (s *stats) routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/country", s.handleCountry)
	mux.HandleFunc("POST /api/beacon", s.handleBeacon)
	mux.HandleFunc("GET /stats", s.handlePage)
}
