package middleware

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/pnfo/tipitaka-go/server/backend"
)

type PageMetadata struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

var (
	metadata map[string]PageMetadata
	allKeys  []string
	scripts  = []string{
		"sinh", "deva", "latn", "thai", "mymr", "khmr", "laoo", "beng", "tibt", "cyrl", "guru", "gujr", "telu", "knda", "mlym", "taml",
		"asse", "lana", "brah", "cakm", "java", "bali",
	}
	transToScript = map[string]string{
		"sin_apz":   "sinh",
		"sin_bjt":   "sinh",
		"eng_thani": "latn",
	}
	distPath string
)

func Init(dataPath, dist string) error {
	distPath = dist
	data, err := os.ReadFile(filepath.Join(dataPath, "metadata.json"))
	if err != nil {
		return err
	}
	if err = json.Unmarshal(data, &metadata); err != nil {
		return err
	}

	// Load all keys from text.db
	db, err := backend.GetDB("text.db") // Assuming backend is initialized
	if err != nil {
		return err
	}
	rows, err := db.Query("SELECT key FROM tree;")
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err == nil {
			allKeys = append(allKeys, key)
		}
	}
	return nil
}

func MetadataMiddleware(c *fiber.Ctx) error {
	path := c.Path()
	if !strings.HasSuffix(path, "/") {
		path += "/"
	}
	if path == "/" {
		return returnIndexWithMeta(c, metadata["/"])
	}
	parts := strings.Split(path, "/")
	if len(parts) < 3 {
		return c.Next()
	}

	// Logic for script detection
	var script string
	coll0 := strings.Split(parts[1], "+")[0]
	if _, exists := transToScript[coll0]; !exists { // should be like /sinh/.... or /sin_bjt/....
		if !contains(scripts, coll0) {
			return c.Next()
		} else {
			script = coll0
		}
	} else {
		script = transToScript[coll0]
	}

	// second part of the path - get meta info from metadata.json
	pageMetadata, exists := metadata["/"+parts[2]]
	if !exists {
		if !contains(allKeys, parts[2]) { // check the exisistance of a key and if not return
			return c.Next()
		}
		pageMetadata = metadata["/key-placeholder"]
	}

	// fillin any params (%s) if any
	paramCount := strings.Count(pageMetadata.Title, "%s")
	if paramCount > 0 {
		var param string
		if len(parts) > 3 && (parts[2] == "book" || parts[2] == "search") {
			param = parts[3]
		} else {
			param = getSuttaNames(parts[2], script)
		}

		// Replace the %s placeholders with the corresponding URL parameters
		pageMetadata.Title = fmt.Sprintf(pageMetadata.Title, param)
		pageMetadata.Description = fmt.Sprintf(pageMetadata.Description, param)
	}

	return returnIndexWithMeta(c, pageMetadata)
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

func getSuttaNames(key string, script string) string {
	parts := strings.Split(key, "-")
	var parentKeys []string
	// Generate parent keys by removing one part at a time from the end
	for i := len(parts); i > 0; i-- {
		parentKey := strings.Join(parts[:i], "-")
		parentKeys = append(parentKeys, "'"+parentKey+"'")
	}
	inClause := strings.Join(parentKeys, ", ")
	query := fmt.Sprintf("SELECT %s FROM tree WHERE key IN (%s) ORDER BY length(key) DESC;", script, inClause)

	// We need to query script-tree.db
	db, err := backend.GetDB("script-tree.db")
	if err != nil {
		return key
	}

	rows, err := db.Queryx(query)
	if err != nil {
		return key
	}
	defer rows.Close()

	var suttaNames []string
	for rows.Next() {
		result := make(map[string]interface{})
		err = rows.MapScan(result)
		if err != nil {
			continue
		}
		if str, ok := result[script].(string); ok {
			suttaNames = append(suttaNames, str)
		}
	}
	return strings.Join(suttaNames, " < ")
}

func returnIndexWithMeta(c *fiber.Ctx, meta PageMetadata) error {
	html, err := os.ReadFile(filepath.Join(distPath, "index.html"))
	if err != nil {
		return err
	}
	htmlStr := string(html)
	htmlStr = strings.ReplaceAll(htmlStr, "{{title}}", meta.Title)
	htmlStr = strings.ReplaceAll(htmlStr, "{{description}}", meta.Description)

	c.Set(fiber.HeaderContentType, fiber.MIMETextHTMLCharsetUTF8)
	return c.SendString(htmlStr)
}
