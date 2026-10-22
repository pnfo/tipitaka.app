/**
 * First visit on the website (no saved settings): the visitor's country sets the Pāḷi script and the interface
 * language (as v2 did, ipinfo.io). Countries not listed keep the guess from the browser languages (settings.ts
 * guessFromBrowser), else Roman / English. Not in the apps (they follow the device language, offline) and not under
 * test automation (navigator.webdriver; e2e sets window.__tipitakaGeoTest to test it).
 * The free ipinfo plan has 50000 lookups a month (used up 2026-10-21): crawlers that run the app (Googlebot renders
 * pages, every one with empty storage) and browsers that do not keep localStorage (every page load a "first visit")
 * are not asked about - see lookupAllowed.
 */

/** country code -> [script, interface language] */
export const COUNTRY_DEFAULTS: Record<string, [string, string]> = {
  IN: ['deva', 'hi'], LK: ['sinh', 'si'], MM: ['mymr', 'my'], TH: ['thai', 'th'],
  CN: ['latn', 'ch'], TW: ['latn', 'ch'], HK: ['latn', 'ch'], MO: ['latn', 'ch'],
  // v2 also had these: the Khmer interface, and the scripts of Laos, Bangladesh and Russia
  KH: ['khmr', 'kh'], LA: ['laoo', 'en'], BD: ['beng', 'en'], RU: ['cyrl', 'en'],
}

const IPINFO = 'https://ipinfo.io/json?token=2632ab35d5f487'

/** the path the visitor arrived at (before the router redirects /): a shared link names its script */
export const landingPath = typeof location !== 'undefined' ? location.pathname : ''

const CRAWLER = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|inspectiontool|preview|facebookexternalhit|mediapartners|yandex|baidu|bytespider|petal|semrush|ahrefs|phantomjs|prerender/i

/** whether to ask for the country: a person's browser (no crawler user agent) that keeps localStorage, so the
 *  lookup happens once (the settings are saved before this runs: a stored visit is no first visit) */
export function lookupAllowed(ua: string, storage: Pick<Storage, 'setItem' | 'getItem' | 'removeItem'> | null): boolean {
  if (CRAWLER.test(ua)) return false
  try {
    if (!storage) return false
    storage.setItem('tipitaka.app-probe', '1')
    const kept = storage.getItem('tipitaka.app-probe') === '1'
    storage.removeItem('tipitaka.app-probe')
    return kept
  } catch {
    return false
  }
}

/** the script and language for the visitor's country, null when unknown (no answer within the timeout, not listed) */
export async function countryDefaults(fetchImpl: typeof fetch = (...a) => fetch(...a), timeoutMs = 3000): Promise<{ script: string; uiLang: string } | null> {
  if (typeof window !== 'undefined') {
    const geoTest = !!(window as { __tipitakaGeoTest?: boolean }).__tipitakaGeoTest // e2e: act as a person's browser
    if (navigator.webdriver && !geoTest) return null
    let storage: Storage | null = null
    try { storage = window.localStorage } catch { /* blocked */ }
    if (!lookupAllowed(geoTest ? '' : navigator.userAgent, storage)) return null
  }
  try {
    // (no AbortController on the old WebViews: a race)
    const res = await Promise.race([
      fetchImpl(IPINFO, { headers: { Accept: 'application/json' } }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
    ])
    if (!res || !res.ok) return null
    const country = String((await res.json() as { country?: string }).country ?? '').toUpperCase()
    const d = COUNTRY_DEFAULTS[country]
    return d ? { script: d[0], uiLang: d[1] } : null
  } catch {
    return null
  }
}
