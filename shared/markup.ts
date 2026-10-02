/**
 * Stored paragraph markup (Roman script, see dev-docs/data-pipeline.md):
 *   **bold**          <hi rend="bold">
 *   {variant}         <note> (variant readings, may contain bold / page refs)
 *   |M1.0001|         <pb ed="M" n="1.0001"/>   editions: M Myanmar, V VRI, P PTS, T Thai
 * None of the characters * { } | occur in the CST text (checked by build/validate.ts), so no escaping is needed.
 * Must stay in sync with server/engine/markup.go (golden vectors in shared/markup-cases.json).
 */

export type Seg =
  | { t: 'text'; s: string }
  | { t: 'bold'; c: Seg[] }
  | { t: 'note'; c: Seg[] }
  | { t: 'pb'; ed: string; n: string }

const PB_RE = /^\|([MVPT])([0-9.]+)\|/

/** parse stored markup into a segment tree. Unbalanced markers are closed at the end of the text. */
export function parseMarkup(text: string): Seg[] {
  const root: Seg[] = []
  const stack: { kind: 'bold' | 'note' | 'root'; c: Seg[] }[] = [{ kind: 'root', c: root }]
  let buf = ''
  const top = () => stack[stack.length - 1]
  const flush = () => {
    if (buf) top().c.push({ t: 'text', s: buf })
    buf = ''
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '*' && text[i + 1] === '*') {
      flush()
      if (top().kind === 'bold') stack.pop()
      else {
        const seg: Seg = { t: 'bold', c: [] }
        top().c.push(seg)
        stack.push({ kind: 'bold', c: seg.c })
      }
      i++
    } else if (ch === '{') {
      flush()
      const seg: Seg = { t: 'note', c: [] }
      top().c.push(seg)
      stack.push({ kind: 'note', c: seg.c })
    } else if (ch === '}') {
      flush()
      while (stack.length > 1 && top().kind !== 'note') stack.pop() // close a bold left open inside the note
      if (stack.length > 1) stack.pop()
    } else if (ch === '|') {
      const m = PB_RE.exec(text.slice(i))
      if (m) {
        flush()
        top().c.push({ t: 'pb', ed: m[1], n: m[2] })
        i += m[0].length - 1
      } else buf += ch
    } else buf += ch
  }
  flush()
  return root
}

/** plain text without notes and page refs (titles, snippets, meta descriptions) */
export function plainText(text: string, keepNotes = false): string {
  const out: string[] = []
  const walk = (segs: Seg[]) => {
    for (const s of segs) {
      if (s.t === 'text') out.push(s.s)
      else if (s.t === 'bold') walk(s.c)
      else if (s.t === 'note' && keepNotes) { out.push(' ('); walk(s.c); out.push(')') }
    }
  }
  walk(parseMarkup(text))
  return out.join('').replace(/\s+/g, ' ').trim()
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface RenderOptions {
  /** converts a plain text run to the target script (identity for Roman) */
  convert?: (s: string) => string
  /** 'inline' shows variants in the text, 'pointer' a clickable marker, 'hidden' drops them */
  notes?: 'inline' | 'pointer' | 'hidden'
  /** which page refs to show, e.g. 'MVPT' or '' for none */
  pageRefs?: string
}

/** markup -> html. Server side SSR uses the same structure (server/engine/markup.go). */
export function markupToHtml(text: string, opt: RenderOptions = {}): string {
  const convert = opt.convert ?? (s => s)
  const notes = opt.notes ?? 'pointer'
  const refs = opt.pageRefs ?? ''
  let noteIdx = 0
  const walk = (segs: Seg[], inNote: boolean): string =>
    segs.map(s => {
      switch (s.t) {
        case 'text': return escapeHtml(convert(s.s))
        case 'bold': return `<b>${walk(s.c, inNote)}</b>`
        case 'pb': return refs.includes(s.ed) ? `<span class="pb" data-ed="${s.ed}" data-n="${s.n}">${s.ed}${s.n}</span>` : ''
        case 'note': {
          if (notes === 'hidden' || inNote) return notes === 'hidden' ? '' : walk(s.c, true)
          const idx = noteIdx++
          if (notes === 'inline') return `<span class="note" data-i="${idx}">[${walk(s.c, true)}]</span>`
          return `<sup class="note-ptr" data-i="${idx}" tabindex="0" role="button">*</sup>`
        }
      }
    }).join('')
  return walk(parseMarkup(text), false)
}

/** the notes of a paragraph in order (for the 'pointer' mode popovers) */
export function noteTexts(text: string): string[] {
  const out: string[] = []
  const collect = (segs: Seg[]) => {
    for (const s of segs) {
      if (s.t === 'note') out.push(serialize(s.c))
      else if (s.t === 'bold') collect(s.c)
    }
  }
  collect(parseMarkup(text))
  return out
}

export function serialize(segs: Seg[]): string {
  return segs.map(s => {
    switch (s.t) {
      case 'text': return s.s
      case 'bold': return `**${serialize(s.c)}**`
      case 'note': return `{${serialize(s.c)}}`
      case 'pb': return `|${s.ed}${s.n}|`
    }
  }).join('')
}
