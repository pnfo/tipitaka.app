package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"unicode/utf8"

	"github.com/fatih/color"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/gofiber/fiber/v2/middleware/logger"
	fiberrecover "github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/pnfo/tipitaka-go/server/backend"
	"github.com/pnfo/tipitaka-go/server/handler"
	"github.com/skratchdot/open-golang/open"
)

var (
	APPNAME     = "Tipitaka.app CST v2.0"
	userBJTPath = ""
	rootPath    = ""
	exePath     = ""
	PORT        = ":8402"
	URL         = "http://localhost" + PORT
)

func getPathToFile(file string) string {
	return filepath.Join(exePath, rootPath, file)
}

func main() {
	printBox()

	noOpen := flag.Bool("no-open", false, "Prevent opening the URL in the browser")
	flag.StringVar(&userBJTPath, "bjt-path", "", "Local folder where BJT scanned pages are located.")
	flag.StringVar(&rootPath, "root-path", "", "Where dist and dbs are located relative to the binary location.")
	flag.Parse()

	exeFile, _ := os.Executable()
	exePath = filepath.Dir(exeFile)
	color.White("Flags no-open=%t, bjt-path=%s, root-path=%s, exePath: %s", *noOpen, userBJTPath, rootPath, exePath)

	// Initialize backend (DB connections, etc.)
	backend.Init(getPathToFile("server-data"), getPathToFile("server-data/text.db"))

	app := fiber.New(fiber.Config{
		AppName:               APPNAME,
		DisableStartupMessage: true,
		// CaseSensitive: true,
		// StrictRouting: true,
		// ServerHeader:  "Fiber",
		// BodyLimit:     10 * 1024 * 1024,
	})

	// Middleware
	app.Use(fiberrecover.New()) // Panic recovery
	app.Use(helmet.New())       // Security headers
	app.Use(logger.New())       // Logging
	app.Use(compress.New(compress.Config{
		Level: compress.LevelBestSpeed, // or LevelBestCompression
	}))

	// API Endpoints
	app.Post("/sql-query", backend.HandleSQLQuery)
	app.Post("/tipitaka-query/", handler.HandleTipitakaQuery)

	// Serve static files with Production settings
	distPath := getPathToFile("dist")
	staticConfig := fiber.Static{
		Compress:  true,
		ByteRange: true,
		Browse:    false,
		MaxAge:    3600, // Cache for 1 hour (adjust as needed for prod)
	}

	app.Static("/", distPath, staticConfig)
	// Fallback for SPA (Single Page Application)
	app.Get("*", func(c *fiber.Ctx) error {
		return c.SendFile(filepath.Join(distPath, "index.html"))
	})

	// Start Server with Graceful Shutdown
	go func() {
		if !*noOpen {
			if err := open.Start(URL); err != nil {
				color.Red("Failed to open URL(%s) %s", URL, err)
			}
		} else {
			color.White("URL (%s) not opened due to -no-open flag.", URL)
		}
		if err := app.Listen(PORT); err != nil {
			log.Panic(err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server with
	// a timeout of 5 seconds.
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c // Block until signal

	color.White("Gracefully shutting down...")
	_ = app.Shutdown()

	color.White("Running cleanup tasks...")
	// Your cleanup tasks go here
	// db.Close()
	color.White("Server successfuly shutdown.")
}

func printBox() {
	gray := color.New(color.FgHiBlack)
	lines := []struct {
		Text  string
		Color *color.Color // Store the Color object directly
	}{
		{APPNAME, color.New(color.FgCyan, color.Bold)},
		{"┈┈┈┈┈┈┈┈┈┈┈┈", gray},
		{URL, color.New(color.FgYellow)},
		{"Visit the above URL in your browser to see the App.", color.New(color.FgHiGreen)},
		{"┄┄┄┄┄┄┄┄┄┈┈┈", gray},
		{"Suggestions and Errors - path.nirvana@gmail.com", gray},
		{"┄┄┄┄┄┄┄┄┄┈┈┈", gray},
		{"You can check if there is a newer version at", gray},
		{"https://github.com/pnfo/tipitaka.app/releases", gray},
	}
	width := 60
	boxColor := gray

	// Print top border
	boxColor.Println("┏" + strings.Repeat("━", width) + "┓")

	for i := 0; i < len(lines); i++ {
		textLen := utf8.RuneCountInString(lines[i].Text)
		padding := (width - textLen) / 2 // Calculate padding for centering
		boxColor.Print("┃")
		fmt.Print(strings.Repeat(" ", padding))
		lines[i].Color.Print(lines[i].Text)
		fmt.Print(strings.Repeat(" ", width-padding-textLen))
		boxColor.Println("┃")
	}

	// Print bottom border
	boxColor.Println("┗" + strings.Repeat("━", width) + "┛")
}
