/**
 * Anonymous usage counts of the website (server/stats.go, shown at /stats). A visit counts from the visitor's first
 * tap, click, wheel or key (crawlers that run the app, all "new" visitors with empty storage, never do): then one
 * beacon says whether the visitor is new and whether this is their first visit of the day / week / month (the server
 * sums these into unique visitors, no visitor id is needed), with the script and interface language. When the page
 * is hidden a second one has the pages opened, the searches made (only the last query of a search typed letter by
 * letter), the app's requests to the server (the features used) and the words tapped in texts.
 * No cookies or ids; not in the apps, not for test automation (e2e sets window.__tipitakaStatsTest to test it).
 */
import type { Router } from 'vue-router'
import { useApi, type Params } from '@/data/api'
import { readJson, writeJson } from '@/stores/storage'
import { isPersonsBrowser } from './country'

const LAST_VISIT = 'tipitaka.app-last-visit' // the UTC day of the last counted visit
const SEARCHES = new Set(['search', 'titles', 'dict'])
const INTERACTIONS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] // not scroll: the app scrolls by itself

/** the parts of a route used here */
interface Loc { name?: string | symbol | null; path: string; params?: Record<string, unknown> }

export interface Visit { new: boolean; day: boolean; week: boolean; month: boolean; script: string; lang: string }

/** the Monday of the (UTC) week of a YYYY-MM-DD day, as the server groups weeks */
export function weekOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/** the visit's flags from the day of the last visit ('' none) */
export function visitFlags(last: string, today: string, isNew: boolean): Pick<Visit, 'new' | 'day' | 'week' | 'month'> {
  return { new: isNew, day: last !== today, week: !last || weekOf(last) !== weekOf(today), month: last.slice(0, 7) !== today.slice(0, 7) }
}

/** counts of one page load, sent when the page is hidden */
export class Tally {
  pages: Record<string, number> = {}
  terms: [string, string][] = []
  ops: Record<string, number> = {}
  words: string[] = []
  private typing: [string, string] | null = null // the search being typed

  route(to: Loc, from?: Loc) {
    const name = String(to.name ?? '')
    if (!name || (from && from.path === to.path)) return // only the hash or query changed
    const q = SEARCHES.has(name) ? String(to.params?.q ?? '').trim() : ''
    if (q) {
      const t = this.typing
      if (t && t[0] === name && (q.startsWith(t[1]) || t[1].startsWith(q))) this.typing = [name, q] // still typing
      else { this.done(); this.typing = [name, q] }
    } else this.done()
    if (!from || from.name !== to.name || !SEARCHES.has(name)) this.pages[name] = (this.pages[name] ?? 0) + 1
  }

  /** a request to the server (repeats are answered by the app's cache and not seen here) */
  op(op: string, params: Params) {
    if (op === 'meta') return
    this.ops[op] = (this.ops[op] ?? 0) + 1
    if (op === 'lookup' && typeof params.w === 'string' && this.words.length < 50) this.words.push(params.w) // a word tapped in a text
  }

  private done() {
    if (this.typing) this.terms.push(this.typing)
    this.typing = null
  }

  /** the counts so far (null: nothing new), cleared */
  take(): Partial<Pick<Tally, 'pages' | 'terms' | 'ops' | 'words'>> | null {
    this.done()
    const out = { ...(Object.keys(this.pages).length && { pages: this.pages }), ...(this.terms.length && { terms: this.terms }),
      ...(Object.keys(this.ops).length && { ops: this.ops }), ...(this.words.length && { words: this.words }) }
    this.pages = {}
    this.terms = []
    this.ops = {}
    this.words = []
    return Object.keys(out).length ? out : null
  }
}

function send(body: unknown) {
  try { navigator.sendBeacon?.(`${import.meta.env.BASE_URL}api/beacon`, JSON.stringify(body)) } catch { /* no beacon */ }
}

/** the website only (App.vue): counts this visit, the router's pages and the app's requests */
export function startStats(router: Router, isNew: boolean, settings: { script: string; uiLang: string }) {
  if (typeof window === 'undefined') return
  const test = !!(window as { __tipitakaStatsTest?: boolean }).__tipitakaStatsTest // e2e: act as a person's browser
  if (navigator.webdriver && !test) return
  let storage: Storage | null = null
  try { storage = window.localStorage } catch { /* blocked */ }
  if (!isPersonsBrowser(test ? '' : navigator.userAgent, storage)) return

  const tally = new Tally()
  const api = useApi(), source = api.source
  api.source = { call: (op, params) => { tally.op(op, params); return source.call(op, params) } }
  tally.route(router.currentRoute.value) // the first page, when the router was ready before this (else it has no name yet)
  router.afterEach((to, from) => tally.route(to, from.matched.length ? from : undefined))

  let counted = false
  const today = new Date().toISOString().slice(0, 10)
  const flags = visitFlags(readJson(LAST_VISIT, ''), today, isNew)
  const interacted = () => {
    if (counted) return
    counted = true
    for (const e of INTERACTIONS) window.removeEventListener(e, interacted, true)
    send({ visit: { ...flags, script: settings.script, lang: settings.uiLang } })
    writeJson(LAST_VISIT, today)
  }
  for (const e of INTERACTIONS) window.addEventListener(e, interacted, { capture: true, passive: true })
  const flush = () => { const t = tally.take(); if (t && counted) send(t) } // no interaction: not counted at all
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
  window.addEventListener('pagehide', flush)
}
