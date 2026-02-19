package fts

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/pnfo/tipitaka-go/server/backend"
)

type QueryParams struct {
	SortByBook   bool     `json:"sortByBook"`
	ExactWord    bool     `json:"exactWord"`
	ExactPhrase  bool     `json:"exactPhrase"`
	MatchOrder   bool     `json:"matchOrder"`
	WordDistance int      `json:"wordDistance"`
	MaxMatches   int      `json:"maxMatches"`
	MaxFiles     int      `json:"maxFiles"`
	Filter       []string `json:"filter"`
}

type Query struct {
	Type   string      `json:"type"`
	Terms  []string    `json:"terms"`
	Params QueryParams `json:"params"`
}

type TokenEntry struct {
	Ind     int      // rowid
	Word    string   // token
	Total   int      // freq
	Files   []string // comma separated string split
	Offsets [][]int  // parsed offsets
}

// TokenLoader fetches data from SQLite
func GetDataForTerm(term string, exactWord bool) ([]TokenEntry, error) {
	db, err := backend.GetDB("db/dict-all.db")
	if err != nil {
		return nil, err
	}

	var query string
	var args []interface{}

	if !exactWord && !strings.HasSuffix(term, "%") {
		term += "%"
	}

	if !exactWord || strings.ContainsAny(term, "_%") {
		// Limit the number of tokens to prevent OOM/Timeouts on broad wildcards like "%a%"
		// Sort by frequency to get the most relevant words first if we hit the limit
		query = "SELECT rowid, token, freq, files, offsetstr FROM tokens WHERE token LIKE ? ORDER BY freq DESC LIMIT 50000"
		args = []interface{}{term}
	} else {
		query = "SELECT rowid, token, freq, files, offsetstr FROM tokens WHERE token = ?"
		args = []interface{}{term}
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []TokenEntry
	for rows.Next() {
		var rowid int
		var token string
		var freq int
		var filesStr string
		var offsetsStr string

		if err := rows.Scan(&rowid, &token, &freq, &filesStr, &offsetsStr); err != nil {
			return nil, err
		}

		files := strings.Split(filesStr, ",")
		offsetGroups := strings.Split(offsetsStr, ",")
		offsets := make([][]int, len(offsetGroups))

		for i, og := range offsetGroups {
			parts := strings.Split(og, ":")
			fileOffsets := make([]int, len(parts))
			for j, p := range parts {
				fmt.Sscanf(p, "%d", &fileOffsets[j])
			}
			offsets[i] = fileOffsets
		}

		entries = append(entries, TokenEntry{
			Ind:     rowid - 1, // JS uses rowid-1
			Word:    token,
			Total:   freq,
			Files:   files,
			Offsets: offsets,
		})
	}
	return entries, nil
}

// Core FTS Logic

// Core FTS Logic

func RunQuery(q Query) (map[string]interface{}, error) {
	start := time.Now()

	// 1. Load Data (Parallel)
	dataList := make([][]TokenEntry, len(q.Terms))
	var wg sync.WaitGroup
	var errMutex sync.Mutex
	var loadErr error

	for i, term := range q.Terms {
		wg.Add(1)
		go func(i int, term string) {
			defer wg.Done()
			entries, err := GetDataForTerm(term, q.Params.ExactWord)
			if err != nil {
				errMutex.Lock()
				loadErr = err
				errMutex.Unlock()
				return
			}
			dataList[i] = entries
		}(i, term)
	}
	wg.Wait()

	if loadErr != nil {
		return nil, loadErr
	}

	// 2. Intersect Files
	files := intersectFiles(dataList, q.Params.Filter)
	if len(files) == 0 {
		return map[string]interface{}{"matches": []interface{}{}, "stats": map[string]int{"returned": 0}}, nil
	}

	// Safety Check
	if err := checkQueryExplosion(q.Terms, files, dataList); err != nil {
		fmt.Printf("Query Explosion Prevented: %v\n", err)
		return map[string]interface{}{
			"error": err.Error(),
		}, nil
	}

	// 3. Process matches using Inverted Index optimization
	matchesMap := make(map[string]*Match) // key: matchStr (ind sequence)
	matchList := []*Match{}

	// Optimization: Pre-group data by file to avoid repeated linear scans
	// file -> termIndex -> [ [ind, off]... ]
	fileTermMap := buildFileTermMap(files, dataList)

	for file, termWOs := range fileTermMap {
		// Verify all terms have entries for this file (intersectFiles handles this, but safe to check len)
		if len(termWOs) != len(q.Terms) {
			continue
		}

		// Sort by offset for each term (needed for search logic)
		for t := range termWOs {
			sort.Slice(termWOs[t], func(i, j int) bool {
				return termWOs[t][i][1] > termWOs[t][j][1] // Descending logic as per original getWordCombinations
			})
		}

		// Get combinations
		combinations := getCombinationsFromWOs(termWOs, q.Params)
		if len(combinations) > 0 {
			addMatches(matchesMap, &matchList, combinations, file)
		}
	}

	// 4. Finalize and Convert to Client Format
	clientMatches := finalizeMatches(&matchList, q.Params, dataList)

	duration := time.Since(start)
	fmt.Printf("Query %v ran in %v\n", q.Terms, duration)

	return map[string]interface{}{
		"query":    q,
		"matches":  clientMatches,
		"wordInfo": getWordInfo(matchList, dataList),
		"stats":    map[string]int{"considered": len(matchesMap), "returned": len(clientMatches)},
	}, nil
}

func checkQueryExplosion(terms []string, files []string, dataList [][]TokenEntry) error {
	for i, data := range dataList {
		complexity := len(data) * len(files)
		// Limit: 20,000,000 (2x JS limit, given Go's speed and our optimization)
		if complexity > 200000000 {
			return fmt.Errorf("The term '%s' is too broad (complexity %d). Please refine your query.", terms[i], complexity)
		}
	}
	return nil
}

// Inverted Index Builder
func buildFileTermMap(files []string, dataList [][]TokenEntry) map[string][][][2]int {
	// file -> [termIndex] -> list of {ind, off}
	fileMap := make(map[string][][][2]int, len(files))
	filesSet := make(map[string]bool, len(files))
	for _, f := range files {
		fileMap[f] = make([][][2]int, len(dataList))
		filesSet[f] = true
	}

	for termIdx, data := range dataList {
		for _, entry := range data {
			for fileIdx, filename := range entry.Files {
				if filesSet[filename] {
					// Add all offsets for this file
					for _, off := range entry.Offsets[fileIdx] {
						fileMap[filename][termIdx] = append(fileMap[filename][termIdx], [2]int{entry.Ind, off})
					}
				}
			}
		}
	}
	return fileMap
}

func getCombinationsFromWOs(woList [][][2]int, params QueryParams) [][][]int {
	if len(woList) == 1 {
		// Single term
		result := make([][][]int, len(woList[0]))
		for i, wo := range woList[0] {
			result[i] = [][]int{{wo[0], wo[1]}}
		}
		return result
	}

	matches := [][][]int{}
	for _, wo := range woList[0] {
		searchOffsetMatches(params, woList, 1, []int{wo[1]}, [][]int{{wo[0], wo[1]}}, &matches)
	}
	return matches
}

// Internal Match Structure
type Match struct {
	Terms         []int // indexes
	Freq          int
	OffsetsByFile map[string][][]int // internal map
	NumFiles      int
}

// ... internal logic ...

func intersectFiles(dataList [][]TokenEntry, filter []string) []string {
	if len(dataList) == 0 {
		return []string{}
	}

	var filterReg *regexp.Regexp
	if len(filter) > 0 {
		filterReg = regexp.MustCompile("^[" + strings.Join(filter, "") + "]")
	}

	// Get file sets
	fileSets := make([]map[string]bool, len(dataList))
	for i, data := range dataList {
		fileSets[i] = make(map[string]bool)
		for _, entry := range data {
			for _, f := range entry.Files {
				fileSets[i][f] = true
			}
		}
	}

	// Intersect
	var result []string
	for f := range fileSets[0] {
		if filterReg != nil && !filterReg.MatchString(f) {
			continue
		}
		match := true
		for i := 1; i < len(fileSets); i++ {
			if !fileSets[i][f] {
				match = false
				break
			}
		}
		if match {
			result = append(result, f)
		}
	}
	return result
}

func getWordCombinations(dataList [][]TokenEntry, file string, params QueryParams) [][][]int {
	// Map dataList to termWOs: [termIndex] -> list of [ind, offset]
	woList := make([][][2]int, len(dataList))

	for i, data := range dataList {
		var termWOs [][2]int
		for _, entry := range data {
			// Find file index
			fileIdx := -1
			for idx, f := range entry.Files {
				if f == file {
					fileIdx = idx
					break
				}
			}
			if fileIdx != -1 {
				for _, off := range entry.Offsets[fileIdx] {
					termWOs = append(termWOs, [2]int{entry.Ind, off})
				}
			}
		}
		// Sort by offset descending
		sort.Slice(termWOs, func(a, b int) bool {
			return termWOs[a][1] > termWOs[b][1]
		})
		woList[i] = termWOs
	}

	if len(woList) == 1 {
		// Single term: return each [ind, off] as a match sequence of length 1
		result := make([][][]int, len(woList[0]))
		for i, wo := range woList[0] {
			result[i] = [][]int{{wo[0], wo[1]}}
		}
		return result
	}

	matches := [][][]int{}
	for _, wo := range woList[0] {
		searchOffsetMatches(params, woList, 1, []int{wo[1]}, [][]int{{wo[0], wo[1]}}, &matches)
	}

	return matches
}

func searchOffsetMatches(params QueryParams, woList [][][2]int, termI int, matchedOffsets []int, curMatch [][]int, matches *[][][]int) {
	if termI >= len(woList) {
		*matches = append(*matches, curMatch)
		return
	}

	minOff, maxOff := minMax(matchedOffsets)
	var minNext, maxNext int

	if params.ExactPhrase {
		minNext = maxOff + 1
		maxNext = maxOff + 1
	} else if params.MatchOrder {
		minNext = maxOff + 1
		maxNext = minOff + params.WordDistance
	} else {
		minNext = maxOff - params.WordDistance
		maxNext = minOff + params.WordDistance
	}

	for _, wo := range woList[termI] {
		ind, off := wo[0], wo[1]
		if off >= minNext && off <= maxNext && !containsInt(matchedOffsets, off) {
			// Recursion
			newMatchedOffsets := make([]int, len(matchedOffsets)+1)
			copy(newMatchedOffsets, matchedOffsets)
			newMatchedOffsets[len(matchedOffsets)] = off

			newCurMatch := make([][]int, len(curMatch)+1)
			copy(newCurMatch, curMatch)
			newCurMatch[len(curMatch)] = []int{ind, off}

			searchOffsetMatches(params, woList, termI+1, newMatchedOffsets, newCurMatch, matches)
		}
	}
}

// Helpers
func minMax(arr []int) (int, int) {
	min, max := arr[0], arr[0]
	for _, v := range arr {
		if v < min {
			min = v
		}
		if v > max {
			max = v
		}
	}
	return min, max
}

func containsInt(arr []int, v int) bool {
	for _, i := range arr {
		if i == v {
			return true
		}
	}
	return false
}

func addMatches(matchesMap map[string]*Match, matchList *[]*Match, matches [][][]int, file string) {
	for _, matchSeq := range matches {
		var inds []string
		var indInts []int
		var offsets []int

		for _, pair := range matchSeq {
			inds = append(inds, fmt.Sprintf("%d", pair[0]))
			indInts = append(indInts, pair[0])
			offsets = append(offsets, pair[1])
		}
		key := strings.Join(inds, "-")

		if m, exists := matchesMap[key]; exists {
			m.Freq++
			if _, ok := m.OffsetsByFile[file]; !ok {
				m.NumFiles++
				m.OffsetsByFile[file] = [][]int{}
			}
			m.OffsetsByFile[file] = append(m.OffsetsByFile[file], offsets)
		} else {
			newMatch := &Match{
				Terms:         indInts,
				Freq:          1,
				OffsetsByFile: map[string][][]int{file: {offsets}},
				NumFiles:      1,
			}
			matchesMap[key] = newMatch
			*matchList = append(*matchList, newMatch)
		}
	}
}

func finalizeMatches(matchList *[]*Match, params QueryParams, dataList [][]TokenEntry) []interface{} {
	// Sort by Freq
	sort.Slice(*matchList, func(i, j int) bool {
		return (*matchList)[i].Freq > (*matchList)[j].Freq
	})
	// Cutoff
	if len(*matchList) > params.MaxMatches {
		*matchList = (*matchList)[:params.MaxMatches]
	}

	var clientMatches []interface{}

	for _, m := range *matchList {
		// Convert offsets map to slice and sort
		var fileOffsets [][]interface{}
		for file, offs := range m.OffsetsByFile {
			fileOffsets = append(fileOffsets, []interface{}{file, offs, len(offs)})
		}

		// Sort files
		sort.Slice(fileOffsets, func(i, j int) bool {
			f1 := fileOffsets[i]
			f2 := fileOffsets[j]
			file1 := f1[0].(string)
			file2 := f2[0].(string)
			count1 := f1[2].(int)
			count2 := f2[2].(int)

			if params.SortByBook {
				idx1 := fileNameStartsIndex(file1)
				idx2 := fileNameStartsIndex(file2)
				if idx1 != idx2 {
					return idx1 < idx2
				}
				return count2 > count1 // Count descending if same book group (unlikely for single file)
			} else {
				// Sort by num offsets desc
				return count2 > count1
			}
		})

		// Slice offsets by MaxFiles
		if len(fileOffsets) > params.MaxFiles {
			fileOffsets = fileOffsets[:params.MaxFiles]
		}

		clientMatches = append(clientMatches, []interface{}{
			m.Terms,
			m.Freq,
			fileOffsets,
			m.NumFiles,
		})
	}
	return clientMatches
}

func getWordInfo(matches []*Match, dataList [][]TokenEntry) map[int]interface{} {
	// Populate word info for matched indexes
	info := make(map[int]interface{})
	for _, m := range matches {
		for i, ind := range m.Terms {
			if _, exists := info[ind]; !exists {
				// Find in dataList[i]
				for _, entry := range dataList[i] {
					if entry.Ind == ind {
						info[ind] = []interface{}{entry.Word, entry.Total, len(entry.Files)} // structure matching JS
						break
					}
				}
			}
		}
	}
	return info
}

// Book Sorting Logic
var fileNameStarts = [][]string{
	{"1"}, {"a", "b", "c", "d", "e"}, {"2"}, {"3"}, {"f", "g", "h", "i", "j"}, {"4"}, {"5"}, {"k", "l", "m", "n", "o"}, {"6"}, {"p", "q", "r", "s", "t", "u", "v", "w", "x", "y"},
}

func fileNameStartsIndex(file string) int {
	firstChar := string(file[0])
	for i, group := range fileNameStarts {
		for _, c := range group {
			if c == firstChar {
				return i
			}
		}
	}
	return len(fileNameStarts) // End if not found
}
