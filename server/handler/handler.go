package handler

import (
	"encoding/json"
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/pnfo/tipitaka-go/server/dict"
	"github.com/pnfo/tipitaka-go/server/fts"
)

// TipitakaQuery Handler
func HandleTipitakaQuery(c *fiber.Ctx) error {
	var body map[string]interface{}
	// Use json.Unmarshal directly to avoid BodyParser reflection issues with maps
	if err := json.Unmarshal(c.Body(), &body); err != nil {
		fmt.Println("JSON Unmarshal error:", err)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	qType, ok := body["type"].(string)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing or invalid type"})
	}

	var result map[string]interface{}
	var err error

	switch qType {
	case "fts":
		// Parse into FTS Query
		var q fts.Query
		// Re-marshal to unmarshal into struct (inefficient but safe for strict types, or use map decoding)
		jsonBytes, _ := json.Marshal(body)
		if err := json.Unmarshal(jsonBytes, &q); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		result, err = fts.RunQuery(q)

	case "dict":
		var q dict.DictQuery
		jsonBytes, _ := json.Marshal(body)
		if err := json.Unmarshal(jsonBytes, &q); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		result, err = dict.RunQuery(q)

	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Unknown query type"})
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(result)
}
