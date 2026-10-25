/**
 * The user guide: web/src/help/<lang>.md is compiled to HTML at build time (a vite plugin, no Markdown parser in
 * the app). Besides Markdown:
 *  - `<!-- version: N -->` on the first line: the version of the English text a translation follows (the help page
 *    says when a translation is older than the English, `npm run i18n:missing` lists them)
 *  - `## Title {#id}`: the anchor of a section, the same in every language (the ? links of the app point to them)
 *  - `:name:` is the lucide icon of that name (https://lucide.dev/icons), the one the app shows (~icons/lucide/<name>)
 *  - links: `/settings` is a page of the app (in the current script), `#search` a section of the help
 */
import fs from 'node:fs'
import { Marked, type Tokens } from 'marked'
import type { Plugin } from 'vite'

export interface HelpPage { html: string; version: number; toc: { id: string; title: string }[] }

const lucide = JSON.parse(fs.readFileSync(new URL('../node_modules/@iconify-json/lucide/icons.json', import.meta.url), 'utf8')) as
  { icons: Record<string, { body: string }>; aliases?: Record<string, { parent: string }> }

function icon(name: string): string {
  const body = (lucide.icons[name] ?? lucide.icons[lucide.aliases?.[name]?.parent ?? ''])?.body
  if (!body) throw new Error(`help: no lucide icon :${name}:`)
  return `<svg class="help-icon" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">${body}</svg>`
}

const ID = /\s*\{#([a-z0-9-]+)\}\s*$/

export function compileHelp(md: string): HelpPage {
  const version = Number(/^<!--\s*version:\s*(\d+)\s*-->/.exec(md)?.[1] ?? 0)
  const toc: HelpPage['toc'] = []
  const marked = new Marked({
    walkTokens(t) {
      if (t.type !== 'heading') return
      const h = t as Tokens.Heading & { id?: string }
      const m = ID.exec(h.text)
      if (!m) return
      h.id = m[1]
      h.text = h.text.replace(ID, '')
      const last = h.tokens[h.tokens.length - 1] as Tokens.Text | undefined
      if (last && 'text' in last) last.text = last.text.replace(ID, '')
      if (h.depth === 2) toc.push({ id: m[1], title: h.text.replace(/:[a-z][a-z0-9-]*:/g, '').trim() })
    },
    renderer: {
      heading(t) {
        const id = (t as Tokens.Heading & { id?: string }).id
        return `<h${t.depth}${id ? ` id="${id}"` : ''}>${this.parser.parseInline(t.tokens)}</h${t.depth}>\n`
      },
    },
  })
  const html = (marked.parse(md.replace(/<!--[\s\S]*?-->/g, ''), { async: false }) as string).replace(/:([a-z][a-z0-9-]*):/g, (_, n: string) => icon(n))
  return { html, version, toc }
}

/** import page from './help/en.md' -> HelpPage */
export function helpMarkdown(): Plugin {
  return {
    name: 'help-markdown',
    transform(code, id) {
      if (!id.endsWith('.md')) return null
      return { code: `export default ${JSON.stringify(compileHelp(code))}`, map: null }
    },
  }
}
