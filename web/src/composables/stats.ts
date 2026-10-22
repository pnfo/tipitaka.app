/**
 * Anonymous usage counts of the website (server/stats.go, shown at /stats). On arrival one beacon: a new or returning
 * visitor, whether this is their first visit of the day / week / month (the server sums these into unique visitors,
 * no visitor id is needed), the script and interface language. When the page is hidden: the pages opened and the
 * searches made (only the last query of a search typed letter by letter). No cookies or ids; not in the apps, not
 * for crawlers or test automation.
 */
import type { Router } from 'vue-router'
import { readJson, writeJson } from '@/stores/storage'
import { isPersonsBrowser } from './country'

const LAST_VISIT = 'tipitaka.app-last-visit' // the UTC day of the last visit
const SEARCHES = new Set(['search', 'titles', 'dict'])

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

  private done() {
    if (this.typing) this.terms.push(this.typing)
    this.typing = null
  }

  /** the counts so far (null: nothing new), cleared */
  take(): { pages?: Record<string, number>; terms?: [string, string][] } | null {
    this.done()
    const out = { ...(Object.keys(this.pages).length && { pages: this.pages }), ...(this.terms.length && { terms: this.terms }) }
    this.pages = {}
    this.terms = []
    return Object.keys(out).length ? out : null
  }
}

function send(body: unknown) {
  try { navigator.sendBeacon?.(`${import.meta.env.BASE_URL}api/beacon`, JSON.stringify(body)) } catch { /* no beacon */ }
}

/** the website only (App.vue): counts this visit and the router's pages */
export function startStats(router: Router, isNew: boolean, settings: { script: string; uiLang: string }) {
  if (typeof window === 'undefined' || navigator.webdriver) return
  let storage: Storage | null = null
  try { storage = window.localStorage } catch { /* blocked */ }
  if (!isPersonsBrowser(navigator.userAgent, storage)) return
  const today = new Date().toISOString().slice(0, 10)
  send({ visit: { ...visitFlags(readJson(LAST_VISIT, ''), today, isNew), script: settings.script, lang: settings.uiLang } })
  writeJson(LAST_VISIT, today)

  const tally = new Tally()
  tally.route(router.currentRoute.value) // the first page, when the router was ready before this (else it has no name yet)
  router.afterEach((to, from) => tally.route(to, from.matched.length ? from : undefined))
  const flush = () => { const t = tally.take(); if (t) send(t) }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
  window.addEventListener('pagehide', flush)
}
