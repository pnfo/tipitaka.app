package main

import (
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
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
	fmt.Fprintf(w, "User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: %s/sitemap.xml\n", a.cfg.Site)
}

// sitemap scripts: every script has its own sitemap (text in that script is a separate page for searches)
func (a *App) handleSitemapIndex(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
	for _, s := range convert.Scripts {
		fmt.Fprintf(w, "<sitemap><loc>%s/sitemaps/%s.xml</loc></sitemap>", a.cfg.Site, s)
	}
	fmt.Fprint(w, `</sitemapindex>`)
}

func (a *App) handleSitemap(w http.ResponseWriter, r *http.Request) {
	script, ok := strings.CutSuffix(r.PathValue("file"), ".xml")
	if !ok || !convert.IsScript(script) {
		http.NotFound(w, r)
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
