package engine

import (
	"context"
	"database/sql"
	"strings"
	"unicode/utf16"
)

// Proper names (tables entity / setting, built by build/names, see dev-docs/names.md): where a sutta or a commentary
// story was taught, by whom when not the Buddha, who came to the Buddha and whom the story is about.

// Entity is a proper name (a DPD name headword).
type Entity struct {
	Slug    string `json:"slug"`
	Type    string `json:"type"` // person | deity | group | place | animal
	Name    string `json:"name"`
	Lemma   string `json:"lemma"` // DPD headword with its homonym number
	Family  string `json:"family,omitempty"`
	Meaning string `json:"meaning,omitempty"`
	// the meaning and family in the interface language (lang=, names_tr.go); the English fields stay (the client's rules)
	MeaningLocal string   `json:"meaningLocal,omitempty"`
	FamilyLocal  string   `json:"familyLocal,omitempty"`
	Lat          *float64 `json:"lat,omitempty"`
	Lon          *float64 `json:"lon,omitempty"`
	Prec         int      `json:"prec,omitempty"` // 1 located, 2 probable, 3 approximate, 4 in or near the place its meaning names
	Units        int      `json:"units"`          // suttas / stories with a setting of the name
	Mentions     int      `json:"mentions"`       // words of the mūla and aṭṭhakathā that name it (sure or not)
}

// SettingRef is one unit (sutta, story) a name is part of the setting of.
type SettingRef struct {
	Role   string  `json:"role"` // place | teacher | with | about
	Ord    int     `json:"ord"`
	Key    string  `json:"key"` // node of the unit (read link: key + para)
	Para   int     `json:"para"`
	Title  string  `json:"title"`
	Book   string  `json:"book"`  // book title
	Group  string  `json:"group"` // its nikāya / piṭaka (books share titles: three Mahāvaggapāḷi)
	Coll   string  `json:"coll"`
	Source string  `json:"src"`
	Conf   float64 `json:"conf"`
}

// Related is a name in the same settings as another one.
type Related struct {
	Entity
	Role  string `json:"role"` // its role in those settings
	Count int    `json:"count"`
}

// EntityInfo is the page of a name.
type EntityInfo struct {
	Entity
	Settings   []SettingRef  `json:"settings"`
	Related    []Related     `json:"related"`
	Homonyms   []Entity      `json:"homonyms"`   // other names of the same spelling
	Comentions []Related     `json:"comentions"` // names often mentioned in the same paragraphs (role "")
	Books      []MentionBook `json:"books"`      // where it is mentioned
}

// MentionBook counts the mentions of a name in a book: sure ones, and those that may be a namesake (maybe).
type MentionBook struct {
	Book  int    `json:"book"`
	Title string `json:"title"`
	Group string `json:"group"`
	Coll  string `json:"coll"`
	Sure  int    `json:"sure"`
	Maybe int    `json:"maybe"`
}

// MentionRef is one mention with the stored markup around it (the client makes the snippet).
type MentionRef struct {
	Key  string `json:"key"`
	Para int    `json:"para"`
	Pre  string `json:"pre"`
	Word string `json:"word"`
	Post string `json:"post"`
	Slug string `json:"slug"` // the name it was taken for (a namesake for maybe mentions)
}

// ParaName is a mention in a paragraph range.
type ParaName struct {
	Entity
	Idx int `json:"i"`
	S   int `json:"s"` // UTF-16 offsets into the paragraph markup
	E   int `json:"e"`
	Amb int `json:"amb"`
}

// SettingRow is a name in the setting of a unit.
type SettingRow struct {
	Entity
	Role   string  `json:"role"`
	Ord    int     `json:"ord"`
	Source string  `json:"src"`
	Conf   float64 `json:"conf"`
	EvKey  string  `json:"evKey"` // the paragraph the setting was read from
	EvPara int     `json:"evPara"`
}

// UnitSetting is the setting of the unit (sutta, story) around a paragraph.
type UnitSetting struct {
	Key   string       `json:"key"`
	Title string       `json:"title"`
	Para  int          `json:"para"`
	End   int          `json:"end"`
	Rows  []SettingRow `json:"rows"`
}

const entityCols = "e.slug, e.type, e.name, e.lemma, e.family, e.meaning, e.lat, e.lon, e.prec, e.units, e.mentions"

func scanEntity(sc interface{ Scan(...any) error }, en *Entity, extra ...any) error {
	var lat, lon sql.NullFloat64
	var prec sql.NullInt64
	if err := sc.Scan(append([]any{&en.Slug, &en.Type, &en.Name, &en.Lemma, &en.Family, &en.Meaning, &lat, &lon, &prec, &en.Units, &en.Mentions}, extra...)...); err != nil {
		return err
	}
	if lat.Valid && lon.Valid {
		en.Lat, en.Lon, en.Prec = &lat.Float64, &lon.Float64, int(prec.Int64)
	}
	return nil
}

// Names lists the names with a setting or a mention, the most used first: q is a prefix of the name (diacritics ignored), types
// filters the type.
func (e *Engine) Names(ctx context.Context, q string, types []string, limit int) ([]Entity, error) {
	out := []Entity{}
	if !e.hasNames {
		return out, nil
	}
	if limit <= 0 || limit > 3000 {
		limit = 3000
	}
	sqlText := "SELECT " + entityCols + " FROM entity e WHERE (e.units > 0 OR e.mentions > 0)"
	args := []any{}
	if q = Fold(strings.TrimSpace(q)); q != "" {
		sqlText += " AND e.name_fold >= ? AND e.name_fold < ?"
		args = append(args, q, q+"￿")
	}
	if len(types) > 0 {
		sqlText += " AND e.type IN (?" + strings.Repeat(", ?", len(types)-1) + ")"
		for _, t := range types {
			args = append(args, t)
		}
	}
	sqlText += " ORDER BY e.units * 5 + e.mentions DESC, e.name_fold LIMIT ?"
	rows, err := e.text.QueryContext(ctx, sqlText, append(args, limit)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var en Entity
		if err := scanEntity(rows, &en); err != nil {
			return nil, err
		}
		out = append(out, en)
	}
	return out, rows.Err()
}

// EntityPage returns a name with its settings (in book order), the names that share them and its homonyms.
func (e *Engine) EntityPage(ctx context.Context, slug string) (*EntityInfo, error) {
	if !e.hasNames {
		return nil, ErrNotFound
	}
	var info EntityInfo
	var id int
	err := scanEntity(e.text.QueryRowContext(ctx, "SELECT "+entityCols+", e.id FROM entity e WHERE e.slug = ?", slug), &info.Entity, &id)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, err
	}

	info.Settings = []SettingRef{}
	rows, err := e.text.QueryContext(ctx, `SELECT role, ord, book_id, para_start, node_id, title, source, conf FROM setting
		WHERE entity_id = ? AND listed = 1 ORDER BY book_id, para_start, role`, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var s SettingRef
		var book, node int
		if err := rows.Scan(&s.Role, &s.Ord, &book, &s.Para, &node, &s.Title, &s.Source, &s.Conf); err != nil {
			rows.Close()
			return nil, err
		}
		if node >= 0 && node < len(e.nodes) {
			s.Key = e.nodes[node].Key
			if s.Title == "" {
				s.Title = e.nodes[node].Title
			}
		}
		if book >= 0 && book < len(e.books) {
			s.Book, s.Coll, s.Group = e.books[book].Title, e.books[book].Coll, e.bookGroup(book)
		}
		info.Settings = append(info.Settings, s)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	info.Related = []Related{}
	rows, err = e.text.QueryContext(ctx, `SELECT `+entityCols+`, s2.role, count(*) AS c FROM setting s1
		JOIN setting s2 ON s2.book_id = s1.book_id AND s2.para_start = s1.para_start AND s2.para_end = s1.para_end AND s2.entity_id != s1.entity_id
		JOIN entity e ON e.id = s2.entity_id
		WHERE s1.entity_id = ? AND s1.listed = 1 GROUP BY s2.entity_id, s2.role ORDER BY c DESC, e.name_fold LIMIT 60`, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var r Related
		if err := scanEntity(rows, &r.Entity, &r.Role, &r.Count); err != nil {
			rows.Close()
			return nil, err
		}
		info.Related = append(info.Related, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	info.Homonyms = []Entity{}
	rows, err = e.text.QueryContext(ctx, "SELECT "+entityCols+" FROM entity e WHERE e.name = ? AND e.slug != ? ORDER BY e.units DESC, e.lemma", info.Name, slug)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var h Entity
		if err := scanEntity(rows, &h); err != nil {
			rows.Close()
			return nil, err
		}
		info.Homonyms = append(info.Homonyms, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	info.Comentions, info.Books = []Related{}, []MentionBook{}
	if !e.hasMentions {
		return &info, nil
	}
	rows, err = e.text.QueryContext(ctx, "SELECT "+entityCols+", '', c.n FROM comention c JOIN entity e ON e.id = c.other_id WHERE c.entity_id = ? ORDER BY c.n DESC LIMIT 40", id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var r Related
		if err := scanEntity(rows, &r.Entity, &r.Role, &r.Count); err != nil {
			rows.Close()
			return nil, err
		}
		info.Comentions = append(info.Comentions, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// per book: its sure mentions, and the unsure ones of it and its namesakes
	ids, err := e.namesakeIDs(ctx, id, info.Name)
	if err != nil {
		return nil, err
	}
	rows, err = e.text.QueryContext(ctx, `SELECT para_id >> 20 AS b, sum(entity_id = ? AND amb = 0), sum(amb > 0) FROM mention
		WHERE entity_id IN (`+placeholders(len(ids))+`) GROUP BY b ORDER BY b`, append([]any{id}, intsAny(ids)...)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var m MentionBook
		if err := rows.Scan(&m.Book, &m.Sure, &m.Maybe); err != nil {
			return nil, err
		}
		if m.Sure == 0 && m.Maybe == 0 {
			continue
		}
		if m.Book >= 0 && m.Book < len(e.books) {
			m.Title, m.Coll, m.Group = e.books[m.Book].Title, e.books[m.Book].Coll, e.bookGroup(m.Book)
		}
		info.Books = append(info.Books, m)
	}
	return &info, rows.Err()
}

// bookGroup: the title of the group of a book's root ("Dīghanikāya"; the collection is shown apart)
func (e *Engine) bookGroup(b int) string {
	root := e.books[b].Root
	if root < 0 || root >= len(e.nodes) || e.nodes[root].Parent < 0 {
		return ""
	}
	t := e.nodes[e.nodes[root].Parent].Title
	if i := strings.Index(t, " ("); i > 0 {
		t = t[:i]
	}
	return t
}

// namesakeIDs: the entity and the others of its name
func (e *Engine) namesakeIDs(ctx context.Context, id int, name string) ([]int, error) {
	rows, err := e.text.QueryContext(ctx, "SELECT id FROM entity WHERE name = ?", name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int{id}
	for rows.Next() {
		var x int
		if err := rows.Scan(&x); err != nil {
			return nil, err
		}
		if x != id {
			ids = append(ids, x)
		}
	}
	return ids, rows.Err()
}

func intsAny(xs []int) []any {
	out := make([]any, len(xs))
	for i, x := range xs {
		out[i] = x
	}
	return out
}

const mentionPage = 100

// Mentions lists the mentions of a name in a book (sure ones; maybe: the unsure ones of it and its namesakes), with
// the markup around them, page by page.
func (e *Engine) Mentions(ctx context.Context, slug string, book int, maybe bool, page int) ([]MentionRef, error) {
	out := []MentionRef{}
	if !e.hasMentions || book < 0 || book >= len(e.books) {
		return out, nil
	}
	var id int
	var name string
	if err := e.text.QueryRowContext(ctx, "SELECT id, name FROM entity WHERE slug = ?", slug).Scan(&id, &name); err == sql.ErrNoRows {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, err
	}
	ids := []int{id}
	cond := "m.entity_id = ? AND m.amb = 0"
	if maybe {
		var err error
		if ids, err = e.namesakeIDs(ctx, id, name); err != nil {
			return nil, err
		}
		cond = "m.entity_id IN (" + placeholders(len(ids)) + ") AND m.amb > 0"
	}
	args := append(intsAny(ids), book<<20, (book+1)<<20, mentionPage, page*mentionPage)
	rows, err := e.text.QueryContext(ctx, `SELECT m.para_id, m.s, m.e, p.text, p.node_id, x.slug FROM mention m JOIN para p ON p.id = m.para_id
		JOIN entity x ON x.id = m.entity_id WHERE `+cond+` AND m.para_id >= ? AND m.para_id < ? ORDER BY m.para_id, m.s LIMIT ? OFFSET ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var pid, s, en, node int
		var text string
		var r MentionRef
		if err := rows.Scan(&pid, &s, &en, &text, &node, &r.Slug); err != nil {
			return nil, err
		}
		r.Para = pid & (paraIDShift - 1)
		if node >= 0 && node < len(e.nodes) {
			r.Key = e.nodes[node].Key
		}
		u := utf16.Encode([]rune(text))
		if s > len(u) || en > len(u) || s > en {
			continue
		}
		r.Pre = string(utf16.Decode(u[max(0, s-160):s]))
		r.Word = string(utf16.Decode(u[s:en]))
		r.Post = string(utf16.Decode(u[en:min(len(u), en+160)]))
		out = append(out, r)
	}
	return out, rows.Err()
}

// ParaNames returns the mentions in the paragraphs [from, to) of the book of key (from < 0: the node).
func (e *Engine) ParaNames(ctx context.Context, key string, from, to int) ([]ParaName, error) {
	n, err := e.node(key)
	if err != nil {
		return nil, err
	}
	out := []ParaName{}
	if !e.hasMentions || n.Book < 0 {
		return out, nil
	}
	if from < 0 {
		from, to = n.Start, n.End
	}
	if to-from > 2000 {
		to = from + 2000
	}
	rows, err := e.text.QueryContext(ctx, "SELECT "+entityCols+`, m.para_id, m.s, m.e, m.amb FROM mention m JOIN entity e ON e.id = m.entity_id
		WHERE m.para_id >= ? AND m.para_id < ? ORDER BY m.para_id, m.s`, n.Book<<20+from, n.Book<<20+to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p ParaName
		var pid int
		if err := scanEntity(rows, &p.Entity, &pid, &p.S, &p.E, &p.Amb); err != nil {
			return nil, err
		}
		p.Idx = pid & (paraIDShift - 1)
		out = append(out, p)
	}
	return out, rows.Err()
}

// Settings returns the setting of the smallest unit (sutta, story) containing paragraph para of the book of key
// (para < 0: the node's first paragraph). nil when the paragraph has none.
func (e *Engine) Settings(ctx context.Context, key string, para int) (*UnitSetting, error) {
	n, err := e.node(key)
	if err != nil {
		return nil, err
	}
	if !e.hasNames || n.Book < 0 {
		return nil, nil
	}
	if para < 0 {
		para = n.Start
	}
	var start, end, node int
	var title string
	unit := func(para int) error {
		return e.text.QueryRowContext(ctx, `SELECT para_start, para_end, node_id, title FROM setting
		WHERE book_id = ? AND para_start <= ? AND para_end > ? ORDER BY para_end - para_start LIMIT 1`, n.Book, para, para).Scan(&start, &end, &node, &title)
	}
	err = unit(para)
	if err == sql.ErrNoRows {
		// a heading above a sutta (the nikāya, book, vagga and sutta titles at the top of a page are at the reading
		// position when a sutta is opened): the setting of the text after the headings
		if text, ok := e.afterHeadings(ctx, n.Book, para); ok {
			err = unit(text)
		}
	}
	if err == sql.ErrNoRows {
		return nil, nil
	} else if err != nil {
		return nil, err
	}
	u := &UnitSetting{Title: title, Para: start, End: end, Rows: []SettingRow{}}
	if node >= 0 && node < len(e.nodes) {
		u.Key = e.nodes[node].Key
		if u.Title == "" {
			u.Title = e.nodes[node].Title
		}
	}
	rows, err := e.text.QueryContext(ctx, `SELECT `+entityCols+`, s.role, s.ord, s.source, s.conf, s.ev_book, s.ev_idx FROM setting s
		JOIN entity e ON e.id = s.entity_id WHERE s.book_id = ? AND s.para_start = ? AND s.para_end = ? ORDER BY s.role, s.ord`, n.Book, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	evKeys := map[[2]int]string{}
	for rows.Next() {
		var r SettingRow
		var evBook int
		if err := scanEntity(rows, &r.Entity, &r.Role, &r.Ord, &r.Source, &r.Conf, &evBook, &r.EvPara); err != nil {
			return nil, err
		}
		k := [2]int{evBook, r.EvPara}
		if _, ok := evKeys[k]; !ok {
			if t, err := e.NodeAt(ctx, evBook, r.EvPara); err == nil {
				evKeys[k] = t.Key
			}
		}
		r.EvKey = evKeys[k]
		u.Rows = append(u.Rows, r)
	}
	return u, rows.Err()
}

var headingRends = map[string]bool{"centre": true, "nikaya": true, "book": true, "chapter": true, "title": true, "subhead": true, "subsubhead": true}

// afterHeadings: when para is a heading, the first paragraph of text after it (at most 8 paragraphs on).
func (e *Engine) afterHeadings(ctx context.Context, book, para int) (int, bool) {
	from := book*paraIDShift + para
	rows, err := e.text.QueryContext(ctx, "SELECT idx, rend FROM para WHERE id >= ? AND id < ? ORDER BY id", from, min(from+8, (book+1)*paraIDShift))
	if err != nil {
		return 0, false
	}
	defer rows.Close()
	for rows.Next() {
		var idx int
		var rend string
		if rows.Scan(&idx, &rend) != nil {
			return 0, false
		}
		if !headingRends[rend] {
			return idx, idx > para
		}
	}
	return 0, false
}

// NameSlugs lists the names with a setting or a sure mention (sitemaps).
func (e *Engine) NameSlugs(ctx context.Context) ([]string, error) {
	out := []string{}
	if !e.hasNames {
		return out, nil
	}
	rows, err := e.text.QueryContext(ctx, "SELECT slug FROM entity WHERE units > 0 OR mentions > 0 ORDER BY slug")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
