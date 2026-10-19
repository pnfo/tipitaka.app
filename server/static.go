package main

import (
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"

	"tipitaka.app/server/convert"
)

var staticExt = map[string]bool{".js": true, ".css": true, ".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
	".svg": true, ".ico": true, ".json": true, ".txt": true, ".map": true, ".woff": true, ".woff2": true, ".ttf": true,
	".webmanifest": true, ".xml": true, ".html": true}

func (a *App) handleStatic(w http.ResponseWriter, r *http.Request) {
	p := path.Clean("/" + r.URL.Path)
	if p != "/" && a.distDir != "" {
		full := filepath.Join(a.distDir, filepath.FromSlash(p))
		if st, err := os.Stat(full); err == nil && !st.IsDir() {
			switch {
			case p == "/index.html":
				a.serveIndex(w, r)
				return
			case strings.HasPrefix(p, "/assets/"):
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			default:
				w.Header().Set("Cache-Control", "public, max-age=86400")
			}
			http.ServeFile(w, r, full)
			return
		}
	}
	// missing static files are 404, everything else is the app (keys may contain dots? no - but be safe)
	if staticExt[strings.ToLower(path.Ext(p))] {
		http.NotFound(w, r)
		return
	}
	a.serveIndex(w, r)
}

func (a *App) handleRobots(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	// (no Crawl-delay since the Go converter: rendering keeps up, and Bing would need days for the sitemaps)
	fmt.Fprintf(w, "User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: %s/sitemap.xml\n", a.cfg.Site)
}

// seoScripts are offered to search engines (sitemaps, hreflang): the first 9 of the script menu, the scripts people
// search Pali in. Pages in the other scripts render too, but every listed script multiplies the crawl (37000 texts
// each, all converted on the server: the 2026-10-19 outage).
var seoScripts = convert.Scripts[:9]

func isSEOScript(s string) bool { return slices.Contains(seoScripts, s) }

// alternates writes the hreflang links of a page (path: the url path after the script)
func (a *App) alternates(head *strings.Builder, path string) {
	for _, s := range seoScripts {
		fmt.Fprintf(head, `<link rel="alternate" hreflang="%s" href="%s/%s/%s">`, scriptLang[s], a.cfg.Site, s, path)
	}
	fmt.Fprintf(head, `<link rel="alternate" hreflang="x-default" href="%s/latn/%s">`, a.cfg.Site, path)
}

// sitemap scripts: every script has its own sitemap (text in that script is a separate page for searches)
func (a *App) handleSitemapIndex(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
	for _, s := range seoScripts {
		fmt.Fprintf(w, "<sitemap><loc>%s/sitemaps/%s.xml</loc></sitemap>", a.cfg.Site, s)
		fmt.Fprintf(w, "<sitemap><loc>%s/sitemaps/names-%s.xml</loc></sitemap>", a.cfg.Site, s)
	}
	fmt.Fprint(w, `</sitemapindex>`)
}

func (a *App) handleSitemap(w http.ResponseWriter, r *http.Request) {
	script, ok := strings.CutSuffix(r.PathValue("file"), ".xml")
	// names-<script>.xml: the names index, the map and every name page (apart: a sitemap holds 50000 urls at most)
	names := strings.HasPrefix(script, "names-")
	script = strings.TrimPrefix(script, "names-")
	if !ok || !isSEOScript(script) {
		http.NotFound(w, r)
		return
	}
	if names {
		slugs, err := a.eng.NameSlugs(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/xml; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
		fmt.Fprintf(w, "<url><loc>%s/%s/names</loc></url><url><loc>%s/%s/map</loc></url>", a.cfg.Site, script, a.cfg.Site, script)
		for _, s := range slugs {
			fmt.Fprintf(w, "<url><loc>%s/%s/names/%s</loc></url>", a.cfg.Site, script, s)
		}
		fmt.Fprint(w, `</urlset>`)
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
	fmt.Fprintf(w, "<url><loc>%s/%s</loc></url>", a.cfg.Site, script)
	for _, n := range a.eng.SitemapNodes() {
		fmt.Fprintf(w, "<url><loc>%s/%s/%s</loc></url>", a.cfg.Site, script, n)
	}
	fmt.Fprint(w, `</urlset>`)
}
