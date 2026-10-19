// Package convert converts the Roman Pali text to the script of a page for server side rendering, with the Go port
// of @pnfo/pali-converter (the submodule server/pali-converter, the same commit as the npm dependency of the web app:
// scripts/check-converter.mjs), so that the server and the web app convert identically.
package convert

import (
	"fmt"

	paliconverter "github.com/pnfo/pali-converter"
)

// Scripts are the target scripts (ISO 15924 codes, lower case) in display order.
var Scripts = []string{"latn", "sinh", "deva", "thai", "mymr", "khmr", "laoo", "beng", "tibt", "cyrl", "guru", "gujr", "telu", "knda",
	"mlym", "taml", "asse", "lana", "brah", "cakm", "java", "bali"}

// IsScript reports whether s is a supported script code.
func IsScript(s string) bool {
	for _, x := range Scripts {
		if x == s {
			return true
		}
	}
	return false
}

// Convert converts Roman Pali text to the script (Roman is returned unchanged, keeping its capitalisation).
func Convert(text, script string) (string, error) {
	if script == "latn" || text == "" {
		return text, nil
	}
	if !IsScript(script) {
		return "", fmt.Errorf("unknown script %q", script)
	}
	return paliconverter.Convert(text, script, paliconverter.Latn), nil
}

// MustConvert converts and returns the input on errors (rendering).
func MustConvert(text, script string) string {
	out, err := Convert(text, script)
	if err != nil {
		return text
	}
	return out
}
