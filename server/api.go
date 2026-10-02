package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"runtime/debug"
	"strings"

	"github.com/klauspost/compress/gzhttp"
	"tipitaka.app/server/engine"
)

const maxBody = 16 << 10

func marshalNoEscape(v any) ([]byte, error) {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(b.Bytes(), "\n"), nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	b, err := marshalNoEscape(v)
	if err != nil {
		log.Printf("json encode: %v", err)
		http.Error(w, "encode failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(status)
	w.Write(b)
}

var errorStatus = map[string]int{"bad_request": 400, "not_found": 404, "too_broad": 422, "timeout": 503, "no_dict": 503, "internal": 500}

// handleAPI runs an engine operation: GET /api/<op>?params (cacheable) or POST with a JSON object.
func (a *App) handleAPI(w http.ResponseWriter, r *http.Request) {
	op := r.PathValue("op")
	var p engine.Params
	if r.Method == http.MethodPost {
		body, err := io.ReadAll(io.LimitReader(r.Body, maxBody))
		m := map[string]any{}
		if err != nil || json.Unmarshal(body, &m) != nil {
			writeJSON(w, 400, map[string]string{"error": "bad_request", "message": "bad json body"})
			return
		}
		p = engine.MapParams(m)
	} else {
		if len(r.URL.RawQuery) > maxBody {
			writeJSON(w, 400, map[string]string{"error": "bad_request", "message": "query too long"})
			return
		}
		if r.Header.Get("If-None-Match") == a.etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		p = engine.URLParams(r.URL.Query())
	}
	res, err := a.eng.Call(r.Context(), op, p)
	if err != nil {
		code := engine.ErrorCode(err)
		if code == "internal" {
			log.Printf("api %s %s: %v", op, r.URL.RawQuery, err)
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, errorStatus[code], map[string]string{"error": code, "message": err.Error()})
		return
	}
	w.Header().Set("ETag", a.etag)
	// responses only change with the data: immutable when the client sends the content hash (?v=)
	if r.Method == http.MethodGet && r.URL.Query().Get("v") == a.eng.Meta["content_hash"] && a.eng.Meta["content_hash"] != "" {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=300")
	}
	writeJSON(w, http.StatusOK, res)
}

func (a *App) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	m := a.eng.MetaInfo()
	writeJSON(w, 200, map[string]any{"status": "ok", "app": APPNAME, "meta": m})
}

func recoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("panic serving %s: %v\n%s", r.URL.Path, err, debug.Stack())
				http.Error(w, "internal error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func gzipMiddleware(next http.Handler) http.Handler { return gzhttp.GzipHandler(next) }

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			h.Set("X-Frame-Options", "SAMEORIGIN")
		}
		next.ServeHTTP(w, r)
	})
}
