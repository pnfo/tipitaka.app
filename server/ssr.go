package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"

	"tipitaka.app/server/convert"
	"tipitaka.app/server/engine"
)

// SSR-lite: text pages (/<script>/<key>) are rendered into index.html - title, description, canonical and
// script alternates, JSON-LD, an <article id="ssr"> with the text (readable without JS and by crawlers) and
// <script id="ssr-data"> with the API responses the reader needs (web/src/data/cache.ts readSsrData).

// routes of the web app that are not text keys (web/src/router.ts)
var reservedRoutes = map[string]string{"search": "Search", "titles": "Title search", "dict": "Dictionary", "bookmarks": "Bookmarks",
	"settings": "Settings", "about": "About", "convert": "Pali script converter", "names": "Places and people", "map": "Map of the places", "help": "Help"}

var scriptLang = map[string]string{"latn": "pi-Latn", "sinh": "pi-Sinh", "deva": "pi-Deva", "thai": "pi-Thai", "mymr": "pi-Mymr",
	"khmr": "pi-Khmr", "laoo": "pi-Laoo", "beng": "pi-Beng", "tibt": "pi-Tibt", "cyrl": "pi-Cyrl", "guru": "pi-Guru", "gujr": "pi-Gujr",
	"telu": "pi-Telu", "knda": "pi-Knda", "mlym": "pi-Mlym", "taml": "pi-Taml", "asse": "pi-Beng", "lana": "pi-Lana", "brah": "pi-Brah",
	"cakm": "pi-Cakm", "java": "pi-Java", "bali": "pi-Bali"}

// v2 script codes used in old ?a= links
var legacyScript = map[string]string{"si": "sinh", "hi": "deva", "ro": "latn", "th": "thai", "lo": "laoo", "my": "mymr", "km": "khmr",
	"be": "beng", "as": "asse", "gm": "guru", "tt": "lana", "gj": "gujr", "te": "telu", "ka": "knda", "mm": "mlym", "br": "brah",
	"tb": "tibt", "cy": "cyrl"}

const siteName = "Tipiṭaka.app"
const defaultDesc = "Pāḷi Tipiṭaka (Chaṭṭha Saṅgāyana) with aṭṭhakathā, ṭīkā and other texts in 22 scripts, full text search and dictionaries (DPD and more)."

var (
	titleRe  = regexp.MustCompile(`(?s)<title>.*?</title>`)
	descRe   = regexp.MustCompile(`<meta name="description"[^>]*>`)
	appDivRe = regexp.MustCompile(`<div id="app"></div>`)
	htmlRe   = regexp.MustCompile(`<html[^>]*>`)
)

type page struct {
	status   int
	html     string
	redirect string
}

// cacheKey must equal web/src/data/cache.ts cacheKey(): op|JSON(params with sorted keys, string values)
func cacheKey(op string, params map[string]string) string {
	b, _ := marshalNoEscape(params) // encoding/json sorts map keys
	return op + "|" + string(b)
}

// ssrCache keeps rendered pages, bounded by their size (a text page in a non-Roman script is up to ~300 KB)
type ssrCache struct {
	mu       sync.Mutex
	maxBytes int
	bytes    int
	order    []string
	items    map[string]page
}

func newSSRCache(maxBytes int) *ssrCache {
	return &ssrCache{maxBytes: maxBytes, items: map[string]page{}}
}

func (c *ssrCache) get(k string) (page, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	p, ok := c.items[k]
	return p, ok
}

func (c *ssrCache) put(k string, p page) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if old, ok := c.items[k]; ok {
		c.bytes -= len(old.html)
	} else {
		c.order = append(c.order, k)
	}
	c.items[k] = p
	c.bytes += len(p.html)
	for c.bytes > c.maxBytes && len(c.order) > 1 {
		c.bytes -= len(c.items[c.order[0]].html)
		delete(c.items, c.order[0])
		c.order = c.order[1:]
	}
}

// render: a redirect, a cached page, or a page rendered in one of the ssr slots (guard.go). ok false: no slot in time
func (a *App) render(ctx context.Context, u *url.URL) (p page, ok bool) {
	// v2 share links: /?a=<file>-<line>-<script>
	if q := u.Query().Get("a"); q != "" {
		if target := a.legacyRedirect(ctx, q); target != "" {
			return page{status: http.StatusMovedPermanently, redirect: target}, true
		}
	}
	key := u.Path
	if p, ok := a.ssr.get(key); ok {
		a.guard.stats.cacheHits.Add(1)
		return p, true
	}
	if !a.guard.ssr.acquire(ctx, ssrWait) {
		return page{}, false
	}
	defer a.guard.ssr.release()
	a.guard.stats.renders.Add(1)
	p = a.renderPath(ctx, u.Path)
	if p.status == 200 || p.status == 404 {
		a.ssr.put(key, p)
	}
	return p, true
}

func (a *App) legacyRedirect(ctx context.Context, q string) string {
	parts := strings.Split(q, "-")
	line := 0
	if len(parts) > 1 {
		line, _ = strconv.Atoi(parts[1])
	}
	script := "latn"
	if len(parts) > 2 {
		if s, ok := legacyScript[parts[2]]; ok {
			script = s
		}
	}
	t, err := a.eng.Legacy(ctx, parts[0], line)
	if err != nil {
		return ""
	}
	return fmt.Sprintf("/%s/%s#p%d", script, t.Key, t.Para)
}

func (a *App) baseHTML(lang string) string {
	h := a.indexHTML
	h = strings.Replace(h, "</head>", fmt.Sprintf(`<meta name="tipitaka-content" content="%s"></head>`, html.EscapeString(a.eng.Meta["content_hash"])), 1)
	if lang != "" {
		h = htmlRe.ReplaceAllLiteralString(h, fmt.Sprintf(`<html lang="%s">`, lang))
	}
	return h
}

func (a *App) renderPath(ctx context.Context, path string) page {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	script, rest := "", parts
	if len(parts) > 0 && convert.IsScript(parts[0]) {
		script, rest = parts[0], parts[1:]
	}
	switch {
	case len(parts) == 1 && parts[0] == "":
		return a.simplePage("", "latn", siteName+" – Pāḷi Tipiṭaka", defaultDesc, a.cfg.Site+"/latn")
	case script != "" && len(rest) == 0:
		return a.simplePage(script, script, siteName+" – Pāḷi Tipiṭaka", defaultDesc, a.cfg.Site+"/"+script)
	case len(rest) == 2 && rest[0] == "names" && rest[1] != "":
		return a.entityPage(ctx, scriptOr(script), rest[1])
	case len(rest) == 1 && rest[0] == "names":
		return a.namesPage(ctx, scriptOr(script))
	case len(rest) == 1 && rest[0] == "map":
		return a.mapPage(ctx, scriptOr(script))
	case len(rest) == 2 && rest[0] == "dict" && rest[1] != "":
		return a.dictPage(ctx, scriptOr(script), rest[1])
	case len(rest) >= 1 && reservedRoutes[rest[0]] != "":
		if script == "" {
			script = "latn"
		}
		return a.simplePage(script, script, reservedRoutes[rest[0]]+" | "+siteName, defaultDesc, "")
	case len(rest) == 1 && a.eng.HasKey(rest[0]):
		if script == "" {
			script = "latn" // bare /<key>: Roman, the client switches to the saved script
		}
		return a.textPage(ctx, script, rest[0])
	}
	return page{status: 404, html: a.baseHTML("")}
}

// scriptOr: the script of the url, Roman when none (the client switches to the saved script)
func scriptOr(s string) string {
	if s == "" {
		return "latn"
	}
	return s
}

func (a *App) simplePage(script, lang, title, desc, canonical string) page {
	out := a.baseHTML(scriptLang[lang])
	out = titleRe.ReplaceAllLiteralString(out, "<title>"+html.EscapeString(title)+"</title>")
	head := fmt.Sprintf(`<meta property="og:title" content="%s"><meta property="og:description" content="%s"><meta property="og:type" content="website">`,
		html.EscapeString(title), html.EscapeString(desc))
	if canonical != "" {
		head += fmt.Sprintf(`<link rel="canonical" href="%s">`, html.EscapeString(canonical))
	}
	out = strings.Replace(out, "</head>", head+"</head>", 1)
	_ = script
	return page{status: 200, html: out}
}

func headingTag(rend string) string {
	switch rend {
	case "nikaya", "book":
		return "h2"
	case "chapter":
		return "h2"
	case "title":
		return "h3"
	case "subhead", "subsubhead":
		return "h4"
	}
	return ""
}

func (a *App) textPage(ctx context.Context, script, key string) page {
	conv := func(s string) string { return convert.MustConvert(s, script) }
	info, err := a.eng.Info(key)
	if err != nil {
		return page{status: 404, html: a.baseHTML("")}
	}
	data := map[string]any{}
	data[cacheKey("node", map[string]string{"key": key})] = info
	var chunk *engine.TextChunk
	if info.Book >= 0 {
		if chunk, err = a.eng.Text(ctx, key, -1, 0); err != nil {
			log.Printf("ssr text %s: %v", key, err)
		} else {
			data[cacheKey("text", map[string]string{"key": key})] = chunk
		}
	}

	// title: "<node> – <book or parent>"
	title := conv(info.Title)
	context := ""
	if info.Kind != "book" && info.BookTitle != "" {
		context = info.BookTitle
	} else if len(info.Path) > 0 {
		context = info.Path[len(info.Path)-1].Title
	}
	fullTitle := title
	if context != "" {
		fullTitle += " – " + conv(context)
	}
	fullTitle += " | " + siteName

	desc := ""
	if chunk != nil {
		var sb strings.Builder
		for _, p := range chunk.Paras {
			if headingTag(p.Rend) != "" || p.Rend == "centre" {
				continue
			}
			sb.WriteString(plainText(p.Text) + " ")
			if sb.Len() > 400 {
				break
			}
		}
		desc = truncate(conv(strings.TrimSpace(sb.String())), 160)
	}
	if desc == "" {
		desc = defaultDesc
	}
	canonical := fmt.Sprintf("%s/%s/%s", a.cfg.Site, script, key)

	var head strings.Builder
	fmt.Fprintf(&head, `<meta name="description" content="%s"><link rel="canonical" href="%s">`, html.EscapeString(desc), html.EscapeString(canonical))
	a.alternates(&head, key)
	fmt.Fprintf(&head, `<meta property="og:title" content="%s"><meta property="og:description" content="%s"><meta property="og:url" content="%s"><meta property="og:type" content="article">`,
		html.EscapeString(fullTitle), html.EscapeString(desc), html.EscapeString(canonical))
	ld := map[string]any{"@context": "https://schema.org", "@type": "Chapter", "name": title, "description": desc, "url": canonical,
		"inLanguage": scriptLang[script], "isPartOf": map[string]any{"@type": "Book", "name": conv(info.BookTitle)},
		"publisher": map[string]any{"@type": "Organization", "name": "Path Nirvana Foundation"}}
	if info.Kind == "book" {
		ld["@type"] = "Book"
		delete(ld, "isPartOf")
	}
	// where it was taught (the setting of the sutta / story)
	if u, err := a.eng.Settings(ctx, key, -1); err == nil && u != nil {
		var places []map[string]any
		for _, r := range u.Rows {
			if r.Role != "place" {
				continue
			}
			p := map[string]any{"@type": "Place", "name": r.Name, "url": fmt.Sprintf("%s/%s/names/%s", a.cfg.Site, script, r.Slug)}
			if r.Lat != nil && r.Lon != nil {
				p["geo"] = map[string]any{"@type": "GeoCoordinates", "latitude": *r.Lat, "longitude": *r.Lon}
			}
			places = append(places, p)
		}
		if len(places) > 0 {
			ld["contentLocation"] = places
		}
	}
	ldJSON, _ := json.Marshal(ld)
	fmt.Fprintf(&head, `<script type="application/ld+json">%s</script>`, ldJSON)

	var art strings.Builder
	fmt.Fprintf(&art, `<article id="ssr" lang="%s"><nav class="ssr-crumbs">`, scriptLang[script])
	for i, p := range info.Path {
		if i > 0 {
			art.WriteString(" › ")
		}
		fmt.Fprintf(&art, `<a href="/%s/%s">%s</a>`, script, p.Key, html.EscapeString(conv(p.Title)))
	}
	art.WriteString(`</nav>`)
	if chunk != nil {
		for _, p := range chunk.Paras {
			if p.Idx >= info.End {
				break
			}
			num := ""
			if p.Num != "" {
				num = `<span class="num">` + html.EscapeString(conv(p.Num)) + `.</span> `
			}
			body := markupToHTML(p.Text, conv)
			if tag := headingTag(p.Rend); tag != "" {
				if p.Rend != "nikaya" && p.Idx == info.Start {
					tag = "h1"
				}
				fmt.Fprintf(&art, `<%s id="p%d">%s%s</%s>`, tag, p.Idx, num, body, tag)
			} else {
				fmt.Fprintf(&art, `<p id="p%d" class="%s">%s%s</p>`, p.Idx, p.Rend, num, body)
			}
		}
	} else {
		fmt.Fprintf(&art, `<h1>%s</h1><ul>`, html.EscapeString(title))
		if kids, err := a.eng.Children(key); err == nil {
			for _, k := range kids {
				fmt.Fprintf(&art, `<li><a href="/%s/%s">%s</a></li>`, script, k.Key, html.EscapeString(conv(k.Title)))
			}
		}
		art.WriteString(`</ul>`)
	}
	if info.Next != "" {
		if n, err := a.eng.Info(info.Next); err == nil {
			fmt.Fprintf(&art, `<nav class="ssr-next"><a href="/%s/%s" rel="next">%s →</a></nav>`, script, n.Key, html.EscapeString(conv(n.Title)))
		}
	}
	art.WriteString(`</article>`)

	var dataJSON bytes.Buffer
	enc := json.NewEncoder(&dataJSON) // escapes < > & so the payload can not close the script tag
	enc.Encode(data)

	out := a.baseHTML(scriptLang[script])
	out = titleRe.ReplaceAllLiteralString(out, "<title>"+html.EscapeString(fullTitle)+"</title>")
	out = descRe.ReplaceAllLiteralString(out, "")
	out = strings.Replace(out, "</head>", head.String()+"</head>", 1)
	out = appDivRe.ReplaceAllLiteralString(out, art.String()+`<div id="app"></div><script type="application/json" id="ssr-data">`+strings.TrimSpace(dataJSON.String())+`</script>`)
	return page{status: 200, html: out}
}

func truncate(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)[:n]
	if i := strings.LastIndex(string(r), " "); i > n/2 {
		return string(r)[:i] + "…"
	}
	return string(r) + "…"
}

func (a *App) serveIndex(w http.ResponseWriter, r *http.Request) {
	bot := isBot(r)
	if bot {
		a.guard.stats.botRequests.Add(1)
	}
	p, ok := a.render(r.Context(), r.URL)
	if !ok {
		// busy: a crawler is asked to come back later, a person gets the app (it renders the page in the browser)
		w.Header().Set("Cache-Control", "no-store")
		if bot {
			a.guard.stats.shedBots.Add(1)
			w.Header().Set("Retry-After", retryBots)
			http.Error(w, "busy, please retry later", http.StatusServiceUnavailable)
			return
		}
		a.guard.stats.shedPeople.Add(1)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(a.baseHTML("")))
		return
	}
	if p.redirect != "" {
		http.Redirect(w, r, p.redirect, p.status)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(p.status)
	w.Write([]byte(p.html))
}
