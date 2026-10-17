/**
 * First visit on the website (no saved settings): the visitor's country sets the Pāḷi script and the interface
 * language (as v2 did, ipinfo.io). Countries not listed keep the guess from the browser languages (settings.ts
 * guessFromBrowser), else Roman / English. Not in the apps (they follow the device language, offline) and not under
 * test automation (navigator.webdriver; e2e sets window.__tipitakaGeoTest to test it).
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

/** the script and language for the visitor's country, null when unknown (no answer within the timeout, not listed) */
export async function countryDefaults(fetchImpl: typeof fetch = (...a) => fetch(...a), timeoutMs = 3000): Promise<{ script: string; uiLang: string } | null> {
  if (typeof window !== 'undefined' && navigator.webdriver && !(window as { __tipitakaGeoTest?: boolean }).__tipitakaGeoTest) return null
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
