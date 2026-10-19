package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net/url"
	"regexp"
	"strings"

	"tipitaka.app/server/convert"
	"tipitaka.app/server/engine"
)

// SSR of the pages that are not texts (see ssr.go): the name pages (/<script>/names/<slug>), the names index, the map
// and the dictionary words (/<script>/dict/<word>): title, description, canonical and script alternates, JSON-LD,
// an <article id="ssr"> readable without JS and by crawlers, and the API response the page needs (ssr-data).

// the API responses embedded in a page are left out above this size (the client fetches them)
const maxSSRData = 256 << 10

var typeLabel = map[string]string{"place": "Place", "person": "Person", "deity": "Deity", "group": "People", "animal": "Animal"}
var roleLabel = map[string]string{"place": "Taught at", "teacher": "Taught by", "with": "With", "about": "About"}

// assemble puts a page together: path is the url path after the script ("names/savatthi")
func (a *App) assemble(script, path, fullTitle, desc string, ld map[string]any, article string, data map[string]any) page {
	canonical := fmt.Sprintf("%s/%s/%s", a.cfg.Site, script, path)
	var head strings.Builder
	fmt.Fprintf(&head, `<meta name="description" content="%s"><link rel="canonical" href="%s">`, html.EscapeString(desc), html.EscapeString(canonical))
	a.alternates(&head, path)
	fmt.Fprintf(&head, `<meta property="og:title" content="%s"><meta property="og:description" content="%s"><meta property="og:url" content="%s"><meta property="og:type" content="website">`,
		html.EscapeString(fullTitle), html.EscapeString(desc), html.EscapeString(canonical))
	if ld != nil {
		ld["@context"] = "https://schema.org"
		ld["url"] = canonical
		ldJSON, _ := json.Marshal(ld)
		fmt.Fprintf(&head, `<script type="application/ld+json">%s</script>`, ldJSON)
	}
	tail := `<div id="app"></div>`
	if len(data) > 0 {
		var dataJSON bytes.Buffer
		enc := json.NewEncoder(&dataJSON) // escapes < > & so the payload can not close the script tag
		enc.Encode(data)
		if dataJSON.Len() <= maxSSRData {
			tail += `<script type="application/json" id="ssr-data">` + strings.TrimSpace(dataJSON.String()) + `</script>`
		}
	}
	out := a.baseHTML(scriptLang[script])
	out = titleRe.ReplaceAllLiteralString(out, "<title>"+html.EscapeString(fullTitle)+"</title>")
	out = descRe.ReplaceAllLiteralString(out, "")
	out = strings.Replace(out, "</head>", head.String()+"</head>", 1)
	out = appDivRe.ReplaceAllLiteralString(out, article+tail)
	return page{status: 200, html: out}
}

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}

// entityPage: /<script>/names/<slug>
func (a *App) entityPage(ctx context.Context, script, slug string) page {
	conv := func(s string) string { return convert.MustConvert(s, script) }
	info, err := a.eng.EntityPage(ctx, slug)
	if err != nil {
		return page{status: 404, html: a.baseHTML("")}
	}
	name := conv(info.Name)
	label := typeLabel[info.Type]

	// what the texts say of it: "362 suttas and stories taught there; mentioned 1255 times"
	byRole := map[string]map[string]bool{}
	for _, s := range info.Settings {
		if byRole[s.Role] == nil {
			byRole[s.Role] = map[string]bool{}
		}
		byRole[s.Role][fmt.Sprintf("%s#%d", s.Key, s.Para)] = true
	}
	var facts []string
	for _, r := range []struct{ role, text string }{{"place", "taught there"}, {"teacher", "taught by them"}, {"with", "with them"}, {"about", "about them"}} {
		if n := len(byRole[r.role]); n > 0 {
			facts = append(facts, plural(n, "sutta or story", "suttas and stories")+" "+r.text)
		}
	}
	if info.Mentions > 0 {
		facts = append(facts, "mentioned "+plural(info.Mentions, "time", "times")+" in the Pāḷi canon and commentaries")
	}
	desc := info.Name
	if info.Meaning != "" {
		desc += ": " + info.Meaning
	}
	if len(facts) > 0 {
		desc += ". " + strings.ToUpper(facts[0][:1]) + facts[0][1:]
		if len(facts) > 1 {
			desc += "; " + strings.Join(facts[1:], "; ")
		}
		desc += "."
	}
	desc = truncate(desc, 200)

	ld := map[string]any{"@type": "Thing", "name": info.Name, "description": desc}
	switch info.Type {
	case "place":
		ld["@type"] = "Place"
		if info.Lat != nil && info.Lon != nil {
			ld["geo"] = map[string]any{"@type": "GeoCoordinates", "latitude": *info.Lat, "longitude": *info.Lon}
		}
	case "person":
		ld["@type"] = "Person"
	case "group":
		ld["@type"] = "Organization"
	}

	var art strings.Builder
	fmt.Fprintf(&art, `<article id="ssr" lang="%s"><nav class="ssr-crumbs"><a href="/%s/names">Places and people</a> › %s</nav>`, scriptLang[script], script, label)
	fmt.Fprintf(&art, `<h1>%s</h1>`, html.EscapeString(name))
	if info.Meaning != "" {
		fmt.Fprintf(&art, `<p>%s</p>`, html.EscapeString(info.Meaning))
	}
	if len(facts) > 0 {
		fmt.Fprintf(&art, `<p>%s.</p>`, html.EscapeString(strings.Join(facts, "; ")))
	}
	for _, role := range []string{"place", "teacher", "with", "about"} {
		var items []engine.SettingRef
		seen := map[string]bool{}
		for _, s := range info.Settings {
			k := fmt.Sprintf("%s#%d", s.Key, s.Para)
			if s.Role == role && !seen[k] {
				seen[k] = true
				items = append(items, s)
			}
		}
		if len(items) == 0 {
			continue
		}
		fmt.Fprintf(&art, `<h2>%s %s</h2><ul>`, roleLabel[role], html.EscapeString(name))
		for i, s := range items {
			if i == 300 {
				fmt.Fprintf(&art, `<li>… %d more</li>`, len(items)-i)
				break
			}
			book := s.Book
			if s.Group != "" {
				book = s.Group + " · " + book
			}
			fmt.Fprintf(&art, `<li><a href="/%s/%s#p%d">%s</a> – %s</li>`, script, s.Key, s.Para, html.EscapeString(conv(s.Title)), html.EscapeString(conv(book)))
		}
		art.WriteString(`</ul>`)
	}
	links := func(title string, es []engine.Related) {
		if len(es) == 0 {
			return
		}
		fmt.Fprintf(&art, `<h2>%s</h2><ul>`, title)
		done := map[string]bool{}
		for _, r := range es {
			if done[r.Slug] {
				continue
			}
			done[r.Slug] = true
			fmt.Fprintf(&art, `<li><a href="/%s/names/%s">%s</a> (%d)</li>`, script, r.Slug, html.EscapeString(conv(r.Name)), r.Count)
		}
		art.WriteString(`</ul>`)
	}
	links("In the same suttas", info.Related)
	links("Often named with", info.Comentions)
	if len(info.Books) > 0 {
		art.WriteString(`<h2>Mentioned in</h2><ul>`)
		for _, b := range info.Books {
			if b.Sure == 0 {
				continue
			}
			t := b.Title
			if b.Group != "" {
				t = b.Group + " · " + t
			}
			fmt.Fprintf(&art, `<li>%s: %d</li>`, html.EscapeString(conv(t)), b.Sure)
		}
		art.WriteString(`</ul>`)
	}
	if len(info.Homonyms) > 0 {
		art.WriteString(`<h2>Others of this name</h2><ul>`)
		for _, h := range info.Homonyms {
			fmt.Fprintf(&art, `<li><a href="/%s/names/%s">%s</a>: %s</li>`, script, h.Slug, html.EscapeString(conv(h.Name)), html.EscapeString(h.Meaning))
		}
		art.WriteString(`</ul>`)
	}
	art.WriteString(`</article>`)

	data := map[string]any{cacheKey("entity", map[string]string{"slug": slug}): info}
	return a.assemble(script, "names/"+slug, name+" – "+label+" | "+siteName, desc, ld, art.String(), data)
}

// namesPage: /<script>/names, the names most used, by type
func (a *App) namesPage(ctx context.Context, script string) page {
	conv := func(s string) string { return convert.MustConvert(s, script) }
	var art strings.Builder
	fmt.Fprintf(&art, `<article id="ssr" lang="%s"><h1>Places and people</h1><p>Where the suttas and the commentary stories were taught, by whom and to whom, and every mention of a name in the Pāḷi canon and commentaries.</p>`, scriptLang[script])
	for _, ty := range []string{"place", "person", "group", "deity", "animal"} {
		es, err := a.eng.Names(ctx, "", []string{ty}, 300)
		if err != nil {
			log.Printf("ssr names: %v", err)
			continue
		}
		if len(es) == 0 {
			continue
		}
		fmt.Fprintf(&art, `<h2>%s</h2><ul>`, typeLabel[ty])
		for _, e := range es {
			fmt.Fprintf(&art, `<li><a href="/%s/names/%s">%s</a> – %s</li>`, script, e.Slug, html.EscapeString(conv(e.Name)), html.EscapeString(truncate(e.Meaning, 90)))
		}
		art.WriteString(`</ul>`)
	}
	art.WriteString(`</article>`)
	desc := "The places and people of the Pāḷi Tipiṭaka and its commentaries: where each sutta was taught, by whom and to whom, and where a name is mentioned."
	ld := map[string]any{"@type": "CollectionPage", "name": "Places and people", "description": desc}
	return a.assemble(script, "names", "Places and people of the Tipiṭaka | "+siteName, desc, ld, art.String(), nil)
}

// mapPage: /<script>/map
func (a *App) mapPage(ctx context.Context, script string) page {
	conv := func(s string) string { return convert.MustConvert(s, script) }
	var art strings.Builder
	fmt.Fprintf(&art, `<article id="ssr" lang="%s"><h1>Map of the places of the Tipiṭaka</h1>`, scriptLang[script])
	art.WriteString(`<p>The places where the suttas and the commentary stories were taught, the mahājanapadas, the great rivers, the Buddha's last journey (DN 16) and the journey of Bāvarī's students (Sn 5).</p><ul>`)
	if es, err := a.eng.Names(ctx, "", []string{"place"}, 400); err == nil {
		for _, e := range es {
			if e.Lat == nil || e.Units == 0 {
				continue
			}
			fmt.Fprintf(&art, `<li><a href="/%s/names/%s">%s</a>: %s</li>`, script, e.Slug, html.EscapeString(conv(e.Name)), plural(e.Units, "sutta or story", "suttas and stories"))
		}
	}
	art.WriteString(`</ul></article>`)
	desc := "A map of the places of the Pāḷi Tipiṭaka: where each sutta was taught, the sixteen mahājanapadas, the rivers and the journeys of DN 16 and Sn 5."
	ld := map[string]any{"@type": "Map", "name": "Map of the places of the Tipiṭaka", "description": desc}
	return a.assemble(script, "map", "Map of the places of the Tipiṭaka | "+siteName, desc, ld, art.String(), nil)
}

var tagRe = regexp.MustCompile(`<[^>]+>`)

func stripTags(s string) string {
	return strings.TrimSpace(html.UnescapeString(tagRe.ReplaceAllString(s, " ")))
}

// dictPage: /<script>/dict/<word>, the DPD headwords and the dictionary entries of a word
func (a *App) dictPage(ctx context.Context, script, word string) page {
	conv := func(s string) string { return convert.MustConvert(s, script) }
	w, err := url.PathUnescape(word)
	if err != nil || w == "" || strings.ContainsAny(w, "*?") {
		return a.simplePage(script, script, reservedRoutes["dict"]+" | "+siteName, defaultDesc, "")
	}
	res, err := a.eng.Dictionary(ctx, w, nil, 100)
	if err != nil || res == nil || (len(res.Dpd) == 0 && len(res.Entries) == 0) {
		return a.simplePage(script, script, conv(w)+" – "+reservedRoutes["dict"]+" | "+siteName, defaultDesc, "")
	}
	var meanings []string
	for _, h := range res.Dpd {
		if len(meanings) == 4 {
			break
		}
		if h.Meaning != "" {
			meanings = append(meanings, h.Meaning)
		}
	}
	for _, e := range res.Entries {
		if len(meanings) > 0 {
			break
		}
		meanings = append(meanings, truncate(stripTags(e.Meaning), 140))
	}
	desc := truncate(w+": "+strings.Join(meanings, "; ")+" – Pāḷi dictionaries (DPD and more).", 200)

	var art strings.Builder
	fmt.Fprintf(&art, `<article id="ssr" lang="%s"><h1>%s</h1>`, scriptLang[script], html.EscapeString(conv(w)))
	if len(res.Dpd) > 0 {
		art.WriteString(`<h2>Digital Pāḷi Dictionary</h2><ul>`)
		for _, h := range res.Dpd {
			fmt.Fprintf(&art, `<li><b>%s</b> (%s) %s</li>`, html.EscapeString(conv(h.Lemma)), html.EscapeString(h.Pos), html.EscapeString(h.Meaning))
		}
		art.WriteString(`</ul>`)
	}
	for i, e := range res.Entries {
		if i == 20 {
			break
		}
		fmt.Fprintf(&art, `<h2>%s</h2><p>%s</p>`, html.EscapeString(conv(e.Word)), html.EscapeString(truncate(stripTags(e.Meaning), 600)))
	}
	art.WriteString(`</article>`)
	ld := map[string]any{"@type": "DefinedTerm", "name": w, "description": desc, "inDefinedTermSet": "Pāḷi dictionaries"}
	// the response of the dictionary page's request (DictView: dict, the default dictionaries, limit 100)
	data := map[string]any{cacheKey("dict", map[string]string{"w": w, "limit": "100"}): res}
	return a.assemble(script, "dict/"+url.PathEscape(w), conv(w)+" – Pāḷi dictionary | "+siteName, desc, ld, art.String(), data)
}
