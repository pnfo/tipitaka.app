// tipitaka.app server: the web app (web/dist), the read-only API over the engine (/api/<op>), server side
// rendering of text pages for SEO, sitemaps and redirects of v2 links. The same binary is the desktop app
// (it opens the browser unless -no-open).
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/skratchdot/open-golang/open"
	"tipitaka.app/server/engine"
)

// APPNAME is shown in the console box and /api/health.
const APPNAME = "Tipitaka.app v3.0"

func main() {
	listen := flag.String("listen", "127.0.0.1:8402", "address to listen on (0.0.0.0:8402 allows LAN access)")
	noOpen := flag.Bool("no-open", false, "do not open the browser")
	rootPath := flag.String("root-path", "", "folder containing dist/ (or web/dist/) and db/, relative to the binary or absolute")
	dbDir := flag.String("db-dir", "", "folder with text.db and dict.db (default <root>/db)")
	site := flag.String("site", "https://tipitaka.app", "public url (canonical links, sitemaps)")
	flag.Parse()

	root, err := findRoot(*rootPath, *dbDir)
	if err != nil {
		log.Fatal(err)
	}
	app, err := NewApp(Config{Root: root, DBDir: *dbDir, Site: *site})
	if err != nil {
		log.Fatal(err)
	}
	url := "http://" + strings.Replace(*listen, "0.0.0.0", "localhost", 1)
	printBox(url, root)
	srv := &http.Server{Addr: *listen, Handler: app.Handler(), ReadHeaderTimeout: 10 * time.Second, WriteTimeout: 60 * time.Second}
	if !*noOpen {
		go func() {
			time.Sleep(300 * time.Millisecond)
			if err := open.Start(url); err != nil {
				log.Printf("failed to open %s: %v", url, err)
			}
		}()
	}
	log.Fatal(srv.ListenAndServe())
}

// findRoot locates the folder holding the web build and the dbs (release zip, deploy folder or repo checkout).
func findRoot(rootPath, dbDir string) (string, error) {
	var candidates []string
	if filepath.IsAbs(rootPath) {
		candidates = append(candidates, rootPath)
	} else {
		if exe, err := os.Executable(); err == nil {
			candidates = append(candidates, filepath.Join(filepath.Dir(exe), rootPath))
		}
		if cwd, err := os.Getwd(); err == nil {
			candidates = append(candidates, filepath.Join(cwd, rootPath), cwd, filepath.Join(cwd, ".."))
		}
	}
	for _, c := range candidates {
		if dbDir != "" {
			if distDir(c) != "" {
				return filepath.Clean(c), nil
			}
			continue
		}
		if _, err := os.Stat(filepath.Join(c, "db", "text.db")); err == nil {
			return filepath.Clean(c), nil
		}
	}
	return "", fmt.Errorf("could not find db/text.db in %v (use -root-path or -db-dir)", candidates)
}

func distDir(root string) string {
	for _, d := range []string{filepath.Join("web", "dist"), "dist"} { // repo checkout first, release layout second
		if _, err := os.Stat(filepath.Join(root, d, "index.html")); err == nil {
			return filepath.Join(root, d)
		}
	}
	return ""
}

func printBox(url, root string) {
	lines := []string{APPNAME, "┈┈┈┈┈┈┈┈┈┈┈┈", url, "Visit the above URL in your browser to see the App.", "┄┄┄┄┄┄┄┄┄┈┈┈",
		"Suggestions and Errors - path.nirvana@gmail.com", "┄┄┄┄┄┄┄┄┄┈┈┈", "You can check if there is a newer version at",
		"https://github.com/pnfo/tipitaka.app/releases"}
	const width = 60
	fmt.Println("┏" + strings.Repeat("━", width) + "┓")
	for _, l := range lines {
		n := len([]rune(l))
		pad := (width - n) / 2
		fmt.Println("┃" + strings.Repeat(" ", pad) + l + strings.Repeat(" ", width-pad-n) + "┃")
	}
	fmt.Println("┗" + strings.Repeat("━", width) + "┛")
	fmt.Println("serving from", root)
}

// Config of the app.
type Config struct {
	Root  string
	DBDir string // default <Root>/db
	Site  string
	// IndexHTML overrides dist/index.html (tests)
	IndexHTML string
}

// App is the http application.
type App struct {
	cfg       Config
	eng       *engine.Engine
	distDir   string
	indexHTML string
	etag      string
	ssr       *ssrCache
}

func NewApp(cfg Config) (*App, error) {
	if cfg.Site == "" {
		cfg.Site = "https://tipitaka.app"
	}
	dbDir := cfg.DBDir
	if dbDir == "" {
		dbDir = filepath.Join(cfg.Root, "db")
	}
	eng, err := engine.Open(dbDir)
	if err != nil {
		return nil, err
	}
	a := &App{cfg: cfg, eng: eng, distDir: distDir(cfg.Root), indexHTML: cfg.IndexHTML, ssr: newSSRCache(500)}
	a.etag = `W/"` + eng.Meta["content_hash"] + `"`
	if a.indexHTML == "" {
		if a.distDir == "" {
			return nil, fmt.Errorf("web build not found in %s/dist or %s/web/dist", cfg.Root, cfg.Root)
		}
		b, err := os.ReadFile(filepath.Join(a.distDir, "index.html"))
		if err != nil {
			return nil, err
		}
		a.indexHTML = string(b)
	}
	return a, nil
}

func (a *App) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", a.handleHealth)
	mux.HandleFunc("GET /api/{op}", a.handleAPI)
	mux.HandleFunc("POST /api/{op}", a.handleAPI)
	mux.HandleFunc("GET /robots.txt", a.handleRobots)
	mux.HandleFunc("GET /sitemap.xml", a.handleSitemapIndex)
	mux.HandleFunc("GET /sitemaps/{file}", a.handleSitemap)
	mux.HandleFunc("GET /", a.handleStatic)
	return recoverMiddleware(securityHeaders(gzipMiddleware(mux)))
}
