package engine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Params are the parameters of an operation: url query values (HTTP) or a JSON object (native bridge).
type Params interface {
	Get(name string) string
}

// URLParams adapts url.Values.
type URLParams url.Values

func (u URLParams) Get(name string) string { return url.Values(u).Get(name) }

// MapParams adapts a decoded JSON object (numbers, bools and string lists are accepted).
type MapParams map[string]any

func (m MapParams) Get(name string) string {
	switch v := m[name].(type) {
	case nil:
		return ""
	case string:
		return v
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(v)
	case []any:
		parts := make([]string, 0, len(v))
		for _, x := range v {
			parts = append(parts, fmt.Sprint(x))
		}
		return strings.Join(parts, ",")
	default:
		return fmt.Sprint(v)
	}
}

const (
	maxParamLen = 2000
	callTimeout = 10 * time.Second
)

func str(p Params, name string) (string, error) {
	v := p.Get(name)
	if len(v) > maxParamLen {
		return "", &ParamError{name + " is too long"}
	}
	return v, nil
}

func num(p Params, name string, def int) (int, error) {
	v := p.Get(name)
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, &ParamError{name + " must be a number"}
	}
	return n, nil
}

func flag(p Params, name string) bool {
	v := p.Get(name)
	return v == "1" || v == "true"
}

// list splits a comma separated parameter.
func splitList(p Params, name string) []string {
	v := strings.TrimSpace(p.Get(name))
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := parts[:0]
	for _, x := range parts {
		if x = strings.TrimSpace(x); x != "" {
			out = append(out, x)
		}
	}
	if len(out) > 50 {
		out = out[:50]
	}
	return out
}

// Ops are the names accepted by Call (the API, documented in dev-docs/api.md).
var Ops = []string{"meta", "children", "node", "text", "links", "glosses", "titles", "fts", "dicts", "dict", "lookup", "legacy", "names", "entity", "settings", "mentions", "paranames"}

// Call runs an operation. Errors are *ParamError (bad request), ErrNotFound, *ErrTooBroad or internal.
func (e *Engine) Call(ctx context.Context, op string, p Params) (any, error) {
	ctx, cancel := context.WithTimeout(ctx, callTimeout)
	defer cancel()
	res, err := e.call(ctx, op, p)
	// the descriptions of the names in the interface language (names_tr.go)
	if err == nil && nameOps[op] {
		if lang := p.Get("lang"); lang != "" && len(lang) <= 8 {
			e.localizeNames(ctx, res, lang)
		}
	}
	return res, err
}

func (e *Engine) call(ctx context.Context, op string, p Params) (any, error) {
	switch op {
	case "meta":
		return e.MetaInfo(), nil
	case "children":
		key, err := str(p, "key")
		if err != nil {
			return nil, err
		}
		return e.Children(key)
	case "node":
		key, err := str(p, "key")
		if err != nil {
			return nil, err
		}
		return e.Info(key)
	case "text":
		key, err := str(p, "key")
		if err != nil {
			return nil, err
		}
		from, err := num(p, "from", -1)
		if err != nil {
			return nil, err
		}
		count, err := num(p, "count", 0)
		if err != nil {
			return nil, err
		}
		return e.Text(ctx, key, from, count)
	case "links":
		key, err := str(p, "key")
		if err != nil {
			return nil, err
		}
		from, err := num(p, "from", -1)
		if err != nil {
			return nil, err
		}
		to, err := num(p, "to", -1)
		if err != nil {
			return nil, err
		}
		return e.Links(ctx, key, from, to)
	case "glosses":
		key, err := str(p, "key")
		if err != nil {
			return nil, err
		}
		from, err := num(p, "from", -1)
		if err != nil {
			return nil, err
		}
		to, err := num(p, "to", -1)
		if err != nil {
			return nil, err
		}
		return e.Glosses(ctx, key, from, to)
	case "titles":
		q, err := str(p, "q")
		if err != nil {
			return nil, err
		}
		limit, err := num(p, "limit", 100)
		if err != nil {
			return nil, err
		}
		// colls (mula, atta ...) is the older name of filter: collections are the root keys
		return e.Titles(ctx, q, append(splitList(p, "filter"), splitList(p, "colls")...), limit)
	case "fts":
		q, err := str(p, "q")
		if err != nil {
			return nil, err
		}
		fq := FtsQuery{Terms: strings.Fields(q), Exact: flag(p, "exact"), Phrase: flag(p, "phrase"), Order: flag(p, "order"), Filter: splitList(p, "filter"),
			SortFreq: flag(p, "sortFreq")}
		if fq.Group, err = str(p, "group"); err != nil {
			return nil, err
		}
		if fq.Distance, err = num(p, "distance", 10); err != nil {
			return nil, err
		}
		if fq.Combo, err = num(p, "combo", -1); err != nil {
			return nil, err
		}
		if fq.Page, err = num(p, "page", 0); err != nil {
			return nil, err
		}
		if fq.PageSize, err = num(p, "pageSize", 50); err != nil {
			return nil, err
		}
		if fq.PageSize <= 0 {
			fq.PageSize = -1 // combos and groups only
		}
		return e.Fts(ctx, fq)
	case "dicts":
		return e.Dicts(ctx)
	case "dict", "lookup":
		w, err := str(p, "w")
		if err != nil {
			return nil, err
		}
		limit, err := num(p, "limit", 0)
		if err != nil {
			return nil, err
		}
		if op == "lookup" {
			return e.Lookup(ctx, w, splitList(p, "dicts"), limit)
		}
		return e.Dictionary(ctx, w, splitList(p, "dicts"), limit)
	case "legacy":
		file, err := str(p, "file")
		if err != nil {
			return nil, err
		}
		line, err := num(p, "line", 0)
		if err != nil {
			return nil, err
		}
		return e.Legacy(ctx, file, line)
	case "names":
		q, err := str(p, "q")
		if err != nil {
			return nil, err
		}
		limit, err := num(p, "limit", 0)
		if err != nil {
			return nil, err
		}
		return e.Names(ctx, q, splitList(p, "types"), limit)
	case "entity":
		slug, err := str(p, "slug")
		if err != nil {
			return nil, err
		}
		return e.EntityPage(ctx, slug)
	case "settings":
		key, err := str(p, "key")
		if err != nil {
			return nil, err
		}
		para, err := num(p, "para", -1)
		if err != nil {
			return nil, err
		}
		return e.Settings(ctx, key, para)
	case "mentions":
		slug, err := str(p, "slug")
		if err != nil {
			return nil, err
		}
		book, err := num(p, "book", -1)
		if err != nil {
			return nil, err
		}
		page, err := num(p, "page", 0)
		if err != nil {
			return nil, err
		}
		return e.Mentions(ctx, slug, book, flag(p, "maybe"), page)
	case "paranames":
		key, err := str(p, "key")
		if err != nil {
			return nil, err
		}
		from, err := num(p, "from", -1)
		if err != nil {
			return nil, err
		}
		to, err := num(p, "to", -1)
		if err != nil {
			return nil, err
		}
		return e.ParaNames(ctx, key, from, to)
	}
	return nil, ErrNotFound
}

// Meta is the public build information.
type Meta struct {
	ContentHash string `json:"contentHash"`
	DbVersion   string `json:"dbVersion"`
	Upstream    string `json:"upstream"`
	BuiltAt     string `json:"builtAt"`
	DpdVersion  string `json:"dpdVersion,omitempty"`
	DpdCitation string `json:"dpdCitation,omitempty"`
	HasDict     bool   `json:"hasDict"`
}

func (e *Engine) MetaInfo() Meta {
	return Meta{ContentHash: e.Meta["content_hash"], DbVersion: e.Meta["db_version"], Upstream: e.Meta["upstream"], BuiltAt: e.Meta["built_at"],
		DpdVersion: e.Meta["dict_dpd_version"], DpdCitation: e.Meta["dict_dpd_citation"], HasDict: e.dict != nil}
}

// ErrorCode classifies an error for clients: bad_request, not_found, too_broad, timeout, no_dict, internal.
func ErrorCode(err error) string {
	var pe *ParamError
	var tb *ErrTooBroad
	switch {
	case errors.As(err, &pe):
		return "bad_request"
	case errors.Is(err, ErrNotFound):
		return "not_found"
	case errors.As(err, &tb):
		return "too_broad"
	case errors.Is(err, context.DeadlineExceeded):
		return "timeout"
	case errors.Is(err, ErrNoDict):
		return "no_dict"
	}
	return "internal"
}

// QueryJSON is the entry point of the native bridge: {"op": "...", ...params} -> {"ok": result} or
// {"error": code, "message": text}.
func (e *Engine) QueryJSON(req string) string {
	var m map[string]any
	if err := json.Unmarshal([]byte(req), &m); err != nil {
		return `{"error":"bad_request","message":"invalid json"}`
	}
	op, _ := m["op"].(string)
	res, err := e.Call(context.Background(), op, MapParams(m))
	if err != nil {
		b, _ := json.Marshal(map[string]string{"error": ErrorCode(err), "message": err.Error()})
		return string(b)
	}
	b, err := json.Marshal(map[string]any{"ok": res})
	if err != nil {
		return `{"error":"internal","message":"encode failed"}`
	}
	return string(b)
}
