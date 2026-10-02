package main

import (
	"html"
	"regexp"
	"strings"
)

// Server side rendering of the stored paragraph markup (same structure as shared/markup.ts markupToHtml with
// notes 'inline' and no page refs): **bold**, {note}, |M1.0001| page refs.

var pbRe = regexp.MustCompile(`^\|([MVPT])([0-9.]+)\|`)

// markupToHTML renders markup; convert is applied to every text run.
func markupToHTML(text string, convert func(string) string) string {
	var b strings.Builder
	var buf strings.Builder
	type frame struct{ kind byte } // 'b' bold, 'n' note
	var stack []frame
	flush := func() {
		if buf.Len() > 0 {
			b.WriteString(html.EscapeString(convert(buf.String())))
			buf.Reset()
		}
	}
	closeTo := func(kind byte) {
		for len(stack) > 0 {
			f := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if f.kind == 'b' {
				b.WriteString("</b>")
			} else {
				b.WriteString("]</span>")
			}
			if f.kind == kind {
				return
			}
		}
	}
	has := func(kind byte) bool {
		for _, f := range stack {
			if f.kind == kind {
				return true
			}
		}
		return false
	}
	for i := 0; i < len(text); i++ {
		c := text[i]
		switch {
		case c == '*' && i+1 < len(text) && text[i+1] == '*':
			flush()
			if len(stack) > 0 && stack[len(stack)-1].kind == 'b' {
				closeTo('b')
			} else {
				b.WriteString("<b>")
				stack = append(stack, frame{'b'})
			}
			i++
		case c == '{':
			flush()
			b.WriteString(`<span class="note">[`)
			stack = append(stack, frame{'n'})
		case c == '}':
			flush()
			if has('n') {
				closeTo('n')
			}
		case c == '|':
			if m := pbRe.FindString(text[i:]); m != "" {
				flush()
				i += len(m) - 1
			} else {
				buf.WriteByte(c)
			}
		default:
			buf.WriteByte(c)
		}
	}
	flush()
	for len(stack) > 0 {
		closeTo(stack[len(stack)-1].kind)
	}
	return b.String()
}

// plainText drops markup, notes and page refs (meta descriptions).
func plainText(text string) string {
	var b strings.Builder
	depth := 0
	for i := 0; i < len(text); i++ {
		c := text[i]
		switch {
		case c == '{':
			depth++
		case c == '}':
			if depth > 0 {
				depth--
			}
		case depth > 0:
		case c == '*':
		case c == '|':
			if m := pbRe.FindString(text[i:]); m != "" {
				i += len(m) - 1
			} else {
				b.WriteByte(c)
			}
		default:
			b.WriteByte(c)
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}
