package engine

import (
	"context"
	"sort"
)

const (
	paraIDShift  = 1 << 20 // must match build/write-db.ts PARA_ID_SHIFT
	maxTextCount = 400
	defTextCount = 150
)

// Para is a stored paragraph (text is markup, see shared/markup.ts).
type Para struct {
	Idx  int    `json:"i"`
	Node string `json:"k"` // key of the node it belongs to
	Rend string `json:"r"`
	Num  string `json:"n,omitempty"`
	Text string `json:"t"`
}

// TextChunk is a window of paragraphs of a book.
type TextChunk struct {
	Book  Book   `json:"book"`
	From  int    `json:"from"`
	To    int    `json:"to"` // exclusive
	Paras []Para `json:"paras"`
	// the nodes starting inside the window (headings / anchors)
	Nodes []Node `json:"nodes"`
}

// Text returns paragraphs of the book of key. from < 0 starts at the node; count <= 0 is the node length
// (capped). The window never extends past the book.
func (e *Engine) Text(ctx context.Context, key string, from, count int) (*TextChunk, error) {
	n, err := e.node(key)
	if err != nil {
		return nil, err
	}
	if n.Book < 0 {
		return nil, &ParamError{"not a text node"}
	}
	b := e.books[n.Book]
	if from < 0 {
		from = n.Start
	}
	if count <= 0 {
		count = n.End - from
		if count > defTextCount {
			count = defTextCount
		}
	}
	if count > maxTextCount {
		count = maxTextCount
	}
	if from >= b.ParaCount {
		from = b.ParaCount - 1
	}
	to := from + count
	if to > b.ParaCount {
		to = b.ParaCount
	}
	return e.textRange(ctx, b, from, to)
}

func (e *Engine) textRange(ctx context.Context, b Book, from, to int) (*TextChunk, error) {
	rows, err := e.text.QueryContext(ctx, "SELECT idx, node_id, rend, num, text FROM para WHERE id >= ? AND id < ? ORDER BY id",
		b.ID*paraIDShift+from, b.ID*paraIDShift+to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	c := &TextChunk{Book: b, From: from, To: to, Paras: make([]Para, 0, to-from), Nodes: []Node{}}
	for rows.Next() {
		var p Para
		var nodeID int
		if err := rows.Scan(&p.Idx, &nodeID, &p.Rend, &p.Num, &p.Text); err != nil {
			return nil, err
		}
		p.Node = e.nodes[nodeID].Key
		c.Paras = append(c.Paras, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	c.Nodes = e.nodesStartingIn(b.ID, from, to)
	return c, nil
}

// nodesStartingIn lists the nodes of a book whose start is in [from, to), in tree order.
func (e *Engine) nodesStartingIn(book, from, to int) []Node {
	out := []Node{}
	ids := e.bookNodes[book]
	i := sort.Search(len(ids), func(k int) bool { return e.nodes[ids[k]].Start >= from })
	for ; i < len(ids) && e.nodes[ids[i]].Start < to; i++ {
		out = append(out, e.nodes[ids[i]])
	}
	return out
}

// NodeAt returns the deepest node containing the paragraph (book, idx).
func (e *Engine) NodeAt(ctx context.Context, book, idx int) (*Node, error) {
	var id int
	err := e.text.QueryRowContext(ctx, "SELECT node_id FROM para WHERE id = ?", book*paraIDShift+idx).Scan(&id)
	if err != nil {
		return nil, ErrNotFound
	}
	n := e.nodes[id]
	return &n, nil
}

// Link is a paragraph level mūla/aṭṭhakathā/ṭīkā link.
type Link struct {
	Idx     int    `json:"i"` // paragraph in the requested range
	Book    int    `json:"b"` // other side
	To      int    `json:"t"` // other side paragraph
	Key     string `json:"k"` // node of the other side paragraph
	Kind    string `json:"kind"`
	Source  string `json:"src"`
	Forward bool   `json:"fwd"` // true: requested paragraph comments on the other side
}

// Links returns the links of the paragraphs [from, to) of the book of key in both directions.
func (e *Engine) Links(ctx context.Context, key string, from, to int) ([]Link, error) {
	n, err := e.node(key)
	if err != nil {
		return nil, err
	}
	if n.Book < 0 {
		return []Link{}, nil
	}
	if from < 0 {
		from, to = n.Start, n.End
	}
	if to-from > 2000 {
		to = from + 2000
	}
	out := []Link{}
	q := func(sqlText string, fwd bool) error {
		rows, err := e.text.QueryContext(ctx, sqlText, n.Book, from, to)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var l Link
			if err := rows.Scan(&l.Idx, &l.Book, &l.To, &l.Kind, &l.Source); err != nil {
				return err
			}
			l.Forward = fwd
			if t, err := e.NodeAt(ctx, l.Book, l.To); err == nil {
				l.Key = t.Key
			}
			out = append(out, l)
		}
		return rows.Err()
	}
	if err := q("SELECT from_idx, to_book, to_idx, kind, source FROM para_link WHERE from_book = ? AND from_idx >= ? AND from_idx < ?", true); err != nil {
		return nil, err
	}
	if err := q("SELECT to_idx, from_book, from_idx, kind, source FROM para_link WHERE to_book = ? AND to_idx >= ? AND to_idx < ?", false); err != nil {
		return nil, err
	}
	return out, nil
}

// LegacyTarget is the new location of a v2 file id + line.
type LegacyTarget struct {
	Key  string `json:"key"`
	Para int    `json:"para"`
}

// Legacy maps a v2 location (file id, 1 based line, 0 = file start) to a key and paragraph.
func (e *Engine) Legacy(ctx context.Context, file string, line int) (*LegacyTarget, error) {
	var t LegacyTarget
	var at int
	err := e.text.QueryRowContext(ctx, "SELECT key, para, line FROM legacy WHERE file = ? AND line <= ? ORDER BY line DESC LIMIT 1", file, line).Scan(&t.Key, &t.Para, &at)
	if err != nil {
		return nil, ErrNotFound
	}
	if n, err := e.node(t.Key); err == nil && line > at {
		// lines after the heading: move forward roughly one paragraph per line, inside the node
		t.Para += line - at
		if t.Para >= n.End {
			t.Para = n.End - 1
		}
	}
	return &t, nil
}
