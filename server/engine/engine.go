// Package engine is the data layer of tipitaka.app: tree, text, title search, full text search and
// dictionary lookups over db/text.db and db/dict.db (built by build/). It is used by the web/desktop server
// (server/) and compiled with gomobile for the Android / iOS apps (server/mobile) so that every platform runs
// the same code next to the databases - only small result sets cross the network or the JS bridge.
//
// All operations take string parameters (url query or a JSON object) and return JSON-serialisable values,
// see Call. The databases are opened read-only.
package engine

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	_ "github.com/mattn/go-sqlite3"
)

// Engine holds the open databases and the in-memory tree.
type Engine struct {
	text *sql.DB
	dict *sql.DB // nil when dict.db is missing
	Meta map[string]string

	nodes     []Node         // index = node id (DFS order)
	byKey     map[string]int // key -> id
	children  [][]int
	mirrored  map[int][]int // node id -> nodes whose mirror_key is this node (its commentaries)
	books     []Book
	bookAnc   [][]string // book id -> keys of the ancestors of its root (for search filters)
	bookNodes [][]int    // book id -> its node ids sorted by start (tree order for equal starts)

	tokMu     sync.Mutex
	paraTok   map[int]*bookParaInfo // book id -> tok offset and node of every paragraph (lazy)
	groupNode []int                 // node id -> the node its search hits are grouped under (sutta / chapter level)

	ftsCache *lru
}

// Node is a tree node (group, book, div or heading).
type Node struct {
	ID       int    `json:"-"`
	Key      string `json:"key"`
	Parent   int    `json:"-"`
	Book     int    `json:"book"`
	Kind     string `json:"kind"`
	Coll     string `json:"coll"`
	Rend     string `json:"rend,omitempty"`
	Title    string `json:"title"`
	fold     string
	Start    int    `json:"start"`
	End      int    `json:"end"`
	Depth    int    `json:"depth"`
	Children int    `json:"children"`
	Prev     string `json:"prev,omitempty"`
	Next     string `json:"next,omitempty"`
	Mirror   string `json:"mirror,omitempty"`
}

// Book is one reading stream (one or more upstream files).
type Book struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	Coll      string `json:"coll"`
	Title     string `json:"title"`
	Root      int    `json:"-"`
	RootKey   string `json:"root"`
	ParaCount int    `json:"paraCount"`
}

var (
	ErrNotFound = errors.New("not found")
	ErrNoDict   = errors.New("dictionary database not available")
)

// ParamError is a bad request parameter.
type ParamError struct{ Msg string }

func (e *ParamError) Error() string { return e.Msg }

// openRO opens an sqlite file strictly read-only (the "file:" prefix is required for the query parameters).
func openRO(path string) (*sql.DB, error) {
	if _, err := os.Stat(path); err != nil {
		return nil, err
	}
	abs, _ := filepath.Abs(path)
	dsn := "file:" + (&url.URL{Path: abs}).EscapedPath() + "?mode=ro&immutable=1&_query_only=1&cache=private"
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(8)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	return db, nil
}

// Open opens text.db (required) and dict.db (optional) in dir.
func Open(dir string) (*Engine, error) {
	return OpenFiles(filepath.Join(dir, "text.db"), filepath.Join(dir, "dict.db"))
}

// OpenFiles opens the given database files; dictPath may be "" or missing.
func OpenFiles(textPath, dictPath string) (*Engine, error) {
	text, err := openRO(textPath)
	if err != nil {
		return nil, err
	}
	e := &Engine{text: text, paraTok: map[int]*bookParaInfo{}, ftsCache: newLRU(64)}
	if dictPath != "" {
		if _, err := os.Stat(dictPath); err == nil {
			if e.dict, err = openRO(dictPath); err != nil {
				return nil, err
			}
		}
	}
	if err := e.load(context.Background()); err != nil {
		text.Close()
		return nil, err
	}
	return e, nil
}

func (e *Engine) Close() {
	e.text.Close()
	if e.dict != nil {
		e.dict.Close()
	}
}

func (e *Engine) load(ctx context.Context) error {
	e.Meta = map[string]string{}
	rows, err := e.text.QueryContext(ctx, "SELECT k, v FROM meta")
	if err != nil {
		return err
	}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			rows.Close()
			return err
		}
		e.Meta[k] = v
	}
	rows.Close()
	if e.dict != nil {
		if rows, err := e.dict.QueryContext(ctx, "SELECT k, v FROM meta"); err == nil {
			for rows.Next() {
				var k, v string
				if rows.Scan(&k, &v) == nil {
					e.Meta["dict_"+k] = v
				}
			}
			rows.Close()
		}
	}

	rows, err = e.text.QueryContext(ctx, `SELECT id, key, parent_id, book_id, kind, coll, rend, title, title_fold, para_start, para_end,
		depth, child_count, prev_key, next_key, mirror_key FROM node ORDER BY id`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var n Node
		if err := rows.Scan(&n.ID, &n.Key, &n.Parent, &n.Book, &n.Kind, &n.Coll, &n.Rend, &n.Title, &n.fold, &n.Start, &n.End,
			&n.Depth, &n.Children, &n.Prev, &n.Next, &n.Mirror); err != nil {
			rows.Close()
			return err
		}
		if n.ID != len(e.nodes) {
			rows.Close()
			return fmt.Errorf("node ids are not dense at %d", n.ID)
		}
		e.nodes = append(e.nodes, n)
	}
	rows.Close()
	e.byKey = make(map[string]int, len(e.nodes))
	e.children = make([][]int, len(e.nodes))
	e.mirrored = map[int][]int{}
	for i, n := range e.nodes {
		e.byKey[n.Key] = i
		if n.Parent >= 0 {
			e.children[n.Parent] = append(e.children[n.Parent], i)
		}
	}
	for i, n := range e.nodes {
		if n.Mirror != "" {
			if t, ok := e.byKey[n.Mirror]; ok {
				e.mirrored[t] = append(e.mirrored[t], i)
			}
		}
	}

	rows, err = e.text.QueryContext(ctx, "SELECT id, name, coll, title, root_id, para_count FROM book ORDER BY id")
	if err != nil {
		return err
	}
	for rows.Next() {
		var b Book
		if err := rows.Scan(&b.ID, &b.Name, &b.Coll, &b.Title, &b.Root, &b.ParaCount); err != nil {
			rows.Close()
			return err
		}
		if b.Root >= 0 && b.Root < len(e.nodes) {
			b.RootKey = e.nodes[b.Root].Key
		}
		e.books = append(e.books, b)
	}
	rows.Close()
	// search result groups: unnumbered section headings roll up to their sutta / chapter
	e.groupNode = make([]int, len(e.nodes))
	for i := range e.nodes {
		g := i
		for {
			n := e.nodes[g]
			if n.Kind != "heading" || n.Parent < 0 || isNumberedTitle(n.Title) {
				break
			}
			if pk := e.nodes[n.Parent].Kind; pk == "book" || pk == "group" {
				break
			}
			g = n.Parent
		}
		e.groupNode[i] = g
	}
	e.bookNodes = make([][]int, len(e.books))
	for i, n := range e.nodes {
		if n.Book >= 0 && n.Book < len(e.books) {
			e.bookNodes[n.Book] = append(e.bookNodes[n.Book], i)
		}
	}
	for _, ids := range e.bookNodes {
		sort.SliceStable(ids, func(a, b int) bool { return e.nodes[ids[a]].Start < e.nodes[ids[b]].Start })
	}
	e.bookAnc = make([][]string, len(e.books))
	for i, b := range e.books {
		for n := b.Root; n >= 0; n = e.nodes[n].Parent {
			e.bookAnc[i] = append(e.bookAnc[i], e.nodes[n].Key)
		}
	}
	return rows.Err()
}

// node returns the node with the key.
func (e *Engine) node(key string) (*Node, error) {
	i, ok := e.byKey[key]
	if !ok {
		return nil, ErrNotFound
	}
	return &e.nodes[i], nil
}

// HasKey reports whether the key exists (SSR route validation).
func (e *Engine) HasKey(key string) bool {
	_, ok := e.byKey[key]
	return ok
}

// Keys returns all node keys in tree order (sitemaps).
func (e *Engine) Keys() []string {
	out := make([]string, len(e.nodes))
	for i, n := range e.nodes {
		out[i] = n.Key
	}
	return out
}

// isNumberedTitle: "12. Sāmaññaphalasuttaṃ", "(5) 1. ..." - suttas, vaggas, chapters
func isNumberedTitle(t string) bool {
	t = strings.TrimLeft(t, "(")
	return t != "" && t[0] >= '0' && t[0] <= '9'
}
