// Package convert runs the JavaScript Pali script converter (@pnfo/pali-converter, copied to
// pali-converter.js by scripts/sync-converter.mjs) in goja, so that server side rendering uses exactly the
// same conversion as the web app.
package convert

import (
	_ "embed"
	"fmt"
	"sync"

	"github.com/dop251/goja"
)

//go:embed pali-converter.js
var source string

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

var (
	program  *goja.Program
	compile  sync.Once
	errInit  error
	runtimes = sync.Pool{New: func() any { return newRuntime() }}
)

type rt struct {
	vm      *goja.Runtime
	convert func(text, to, from string) string
	err     error
}

func newRuntime() any {
	compile.Do(func() { program, errInit = goja.Compile("pali-converter.js", source+"\n;({ convert })", true) })
	if errInit != nil {
		return &rt{err: errInit}
	}
	vm := goja.New()
	noop := func(goja.FunctionCall) goja.Value { return goja.Undefined() }
	console := vm.NewObject()
	for _, m := range []string{"log", "warn", "error", "info", "debug", "assert"} {
		console.Set(m, noop)
	}
	vm.Set("console", console)
	v, err := vm.RunProgram(program)
	if err != nil {
		return &rt{err: err}
	}
	var fn func(text, to, from string) string
	if err := vm.ExportTo(v.ToObject(vm).Get("convert"), &fn); err != nil {
		return &rt{err: err}
	}
	return &rt{vm: vm, convert: fn}
}

// Convert converts Roman Pali text to the script (Roman is returned unchanged, keeping its capitalisation).
func Convert(text, script string) (out string, err error) {
	if script == "latn" || text == "" {
		return text, nil
	}
	if !IsScript(script) {
		return "", fmt.Errorf("unknown script %q", script)
	}
	r := runtimes.Get().(*rt)
	if r.err != nil {
		return "", r.err
	}
	defer runtimes.Put(r)
	defer func() {
		if p := recover(); p != nil {
			err = fmt.Errorf("convert: %v", p)
		}
	}()
	return r.convert(text, script, "latn"), nil
}

// MustConvert converts and returns the input on errors (rendering).
func MustConvert(text, script string) string {
	out, err := Convert(text, script)
	if err != nil {
		return text
	}
	return out
}
