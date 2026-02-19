package backend

import (
	"fmt"
	"path/filepath"
	"strings"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/jmoiron/sqlx"
	_ "github.com/mattn/go-sqlite3"
)

type QueryPayload struct {
	DBName string `json:"dbname"`
	Query  string `json:"query"`
}

var (
	dbConnections = make(map[string]*sqlx.DB)
	mutex         sync.Mutex
	dataDir       string
	textDbPath    string
)

func Init(dir string, textDb string) {
	dataDir = dir
	textDbPath = textDb
}

func getDBPath(dbName string) string {
	return filepath.Join(dataDir, dbName)
}

func GetDB(dbName string) (*sqlx.DB, error) {
	mutex.Lock()
	defer mutex.Unlock()

	if db, exists := dbConnections[dbName]; exists {
		return db, nil
	}

	dbPath := getDBPath(dbName)
	db, err := sqlx.Open("sqlite3", dbPath+"?mode=ro")
	if err != nil {
		return nil, err
	}

	// Auto-attach text.db for search databases
	if strings.HasPrefix(dbName, "search-") && textDbPath != "" {
		db.SetMaxOpenConns(1)
		_, err = db.Exec("ATTACH DATABASE '" + textDbPath + "' AS textdb")
		if err != nil {
			db.Close()
			return nil, fmt.Errorf("failed to attach text.db: %w", err)
		}
	}

	dbConnections[dbName] = db
	return db, nil
}

func HandleSQLQuery(c *fiber.Ctx) error {
	var payload QueryPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	db, err := GetDB(payload.DBName)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	rows, err := db.Queryx(payload.Query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		result := make(map[string]interface{})
		err = rows.MapScan(result)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		// Fix byte slices from SQLite being returned as base64 in JSON
		for k, v := range result {
			if b, ok := v.([]byte); ok {
				result[k] = string(b)
			}
		}
		results = append(results, result)
	}

	return c.JSON(results)
}
