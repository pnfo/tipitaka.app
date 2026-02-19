package dict

import (
	"fmt"
	"sort"

	"github.com/pnfo/tipitaka-go/server/backend"
)

type DictQuery struct {
	Word         string   `json:"word"`
	Dictionaries []string `json:"dictionaries"`
	Limit        int      `json:"limit"`
}

type DictMatch struct {
	Word     string `json:"word"`
	Meaning  string `json:"meaning"`
	RowID    int    `json:"rowid"`
	DictName string `json:"dictName"`
	Distance int    `json:"distance"`
}

// Search Dictionaries
// Search Dictionaries
func RunQuery(q DictQuery) (map[string]interface{}, error) {
	fmt.Printf("Dict Search: word='%s', dictionaries=%v, limit=%d\n", q.Word, q.Dictionaries, q.Limit)
	allMatches := []DictMatch{} // Initialize as empty slice to avoid null in JSON

	for _, dictName := range q.Dictionaries {
		matches, err := searchInDict(dictName, q.Word, q.Limit)
		if err != nil {
			fmt.Printf("Error searching dict %s: %v\n", dictName, err)
			continue
		}
		if len(matches) > 0 {
			allMatches = append(allMatches, matches...)
		}
	}

	// Sort by Levenshtein distance
	for i := range allMatches {
		allMatches[i].Distance = Levenshtein(allMatches[i].Word, q.Word)
	}

	sort.Slice(allMatches, func(i, j int) bool {
		return allMatches[i].Distance < allMatches[j].Distance
	})

	if len(allMatches) > q.Limit {
		allMatches = allMatches[:q.Limit]
	}

	// Also query breakup db
	breakups, _ := searchBreakups(q.Word)
	if breakups == nil {
		breakups = []Breakup{}
	}

	fmt.Printf("Dict Search Result: %d matches, %d breakups\n", len(allMatches), len(breakups))

	return map[string]interface{}{
		"query":    q,
		"matches":  allMatches,
		"breakups": breakups,
	}, nil
}

func searchInDict(dictName, word string, limit int) ([]DictMatch, error) {
	db, err := backend.GetDB("dicts/" + dictName + ".db")
	if err != nil {
		return nil, err
	}

	// 1. Exact match
	rows, err := db.Queryx("SELECT rowid, word, meaning FROM dictionary WHERE word LIKE ?", word)
	if err != nil {
		return nil, err
	}

	var matches []DictMatch
	for rows.Next() {
		var m DictMatch
		if err := rows.Scan(&m.RowID, &m.Word, &m.Meaning); err != nil {
			continue
		}
		m.DictName = dictName
		matches = append(matches, m)
	}
	rows.Close()

	if len(matches) > 0 {
		return matches, nil
	}

	// 2. Fuzzy/Prefix (simplified to limited wildcard for performance)
	// Original JS logic: strip ending and query with limit 100
	// const stripEnd = word.replace(/[\u0DCA-\u0DDF\u0D82\u0D83]$/g, '');
	// Go regex for unicode range?
	// For now, simpler fuzzy:
	query := "SELECT rowid, word, meaning FROM dictionary WHERE word LIKE ? LIMIT 100"
	rows, err = db.Queryx(query, word+"%") // Prefix search as fallback
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var m DictMatch
		if err := rows.Scan(&m.RowID, &m.Word, &m.Meaning); err != nil {
			continue
		}
		m.DictName = dictName
		matches = append(matches, m)
	}
	return matches, nil
}

type Breakup struct {
	RowID    int    `json:"rowid"`
	Word     string `json:"word"`
	Type     string `json:"type"`
	Origin   string `json:"origin"`
	BreakStr string `json:"breakstr"`
}

func searchBreakups(word string) ([]Breakup, error) {
	db, err := backend.GetDB("db/breakups.db")
	if err != nil {
		fmt.Printf("Error opening breakups.db: %v\n", err)
		return []Breakup{}, nil // Return empty, don't fail entire query
	}

	query := "SELECT rowid, word, type, origin, breakstr FROM breakup WHERE word = ?"

	// 1. Exact match
	breakups := []Breakup{}
	err = db.Select(&breakups, query, word)
	if err != nil {
		// Log but continue
		fmt.Printf("Error querying breakups: %v\n", err)
	}

	if len(breakups) > 0 {
		return breakups, nil
	}

	// 2. Fuzzy/Strip End
	// JS: word.replace(/[\u0DCA-\u0DDF\u0D82\u0D83]$/g, '')
	// \u0DCA-\u0DDF are Sinhala signs, \u0D82 (Anusvaraya), \u0D83 (Visargaya)
	// We can use regex or simple trimming if it stands for specific suffixes.
	// Since we need regex replacement, we use regexp package.
	// Note: We need to compile regex once globally for performance, but for now inside function is fine or we can assume it removes specific suffixes.
	// Let's use regexp.

	// We need to import "regexp" at file level, but I can't add imports easily with replace_file_content if I only target this block.
	// I will use a helper function or assume I can modify imports in a separate step if needed.
	// Actually, checking file content, "regexp" is NOT imported in dict.go yet.
	// I will try to implement a simple rune-based stripper or I will add the import in a subsequent step.
	// Let's try to add the import in the same step if I can view the file again... I have the view.
	// "fmt" and "sort" are imported.

	// For now, I'll proceed without regexp if possible, or add it.
	// The range is contiguous \u0DCA-\u0DDF. And \u0D82, \u0D83.
	// Let's just use a simple loop to trim suffix? No, regex is cleaner.

	// Wait, I can't add imports in this block.
	// I will implement `searchBreakups` and then add imports if needed.
	// Actually, `backend.go` uses `replace_file_content` which can be tricky for imports.
	// I'll stick to a helper or just do the logic.

	strippedWord := stripSinhalaSuffix(word)
	if strippedWord != word {
		err = db.Select(&breakups, query, strippedWord)
		if err != nil {
			fmt.Printf("Error querying breakups (stripped): %v\n", err)
		}
	}

	return breakups, nil
}

func stripSinhalaSuffix(s string) string {
	// JS: /[\u0DCA-\u0DDF\u0D82\u0D83]$/g
	runes := []rune(s)
	if len(runes) == 0 {
		return s
	}
	last := runes[len(runes)-1]
	if (last >= 0x0DCA && last <= 0x0DDF) || last == 0x0D82 || last == 0x0D83 {
		return string(runes[:len(runes)-1])
	}
	return s
}

func Levenshtein(a, b string) int {
	// ... (Implementation of Levenshtein distance) ...
	// Simplified recursive or matrix based
	// Using standard algorithm
	la := len(a)
	lb := len(b)
	d := make([][]int, la+1)
	for i := range d {
		d[i] = make([]int, lb+1)
	}
	for i := 0; i <= la; i++ {
		d[i][0] = i
	}
	for j := 0; j <= lb; j++ {
		d[0][j] = j
	}
	for i := 1; i <= la; i++ {
		for j := 1; j <= lb; j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			min1 := d[i-1][j] + 1
			min2 := d[i][j-1] + 1
			min3 := d[i-1][j-1] + cost
			d[i][j] = min(min1, min(min2, min3))
		}
	}
	return d[la][lb]
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
