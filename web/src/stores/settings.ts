/**
 * User settings, saved in localStorage 'tipitaka.app-settings-3'. The first run imports the v2 settings
 * ('settings': paliScript si/ro/..., uiLanguage, dictList, ...).
 */
import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import { LEGACY_SCRIPT, isScriptCode, DEFAULT_SCRIPT } from '@shared/scripts'
import { readJson, writeJson } from './storage'

export const SETTINGS_KEY = 'tipitaka.app-settings-3'

export type Theme = 'light' | 'sepia' | 'dark'
export type NotesMode = 'pointer' | 'inline' | 'hidden'
export type Layout = 'single' | 'parallel'

export interface Settings {
  script: string
  uiLang: string
  theme: Theme
  textSize: number // px
  leading: number
  width: number // reading column px
  notes: NotesMode
  pageRefs: string // editions shown, subset of 'MVPT'
  paraNums: boolean
  /** dictionaries used for lookups ('dpd' + dict codes); empty = all */
  dicts: string[]
  layout: Layout
  /** tap a word to look it up */
  tapLookup: boolean
}

export const DEFAULTS: Settings = {
  script: DEFAULT_SCRIPT, uiLang: 'en', theme: 'light', textSize: 18, leading: 1.65, width: 760, notes: 'pointer', pageRefs: '',
  paraNums: true, dicts: [], layout: 'single', tapLookup: true,
}

/** v2 settings -> v3 (scripts/settings.js keys) */
export function migrateV2(old: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {}
  const script = LEGACY_SCRIPT[String(old.paliScript ?? '')]
  if (script) out.script = script
  const ui = String(old.uiLanguage ?? '')
  if (['en', 'si', 'my', 'th', 'kh', 'hi', 'ch'].includes(ui)) out.uiLang = ui
  if (old.colorTheme === 'dark') out.theme = 'dark'
  if (Array.isArray(old.dictList) && old.dictList.length) out.dicts = ['dpd', ...(old.dictList as string[])]
  if (old.footnoteFormat === 'hidden') out.notes = 'hidden'
  else if (old.footnoteFormat === 'inline') out.notes = 'inline'
  return out
}

export function loadSettings(): Settings {
  const saved = readJson<Partial<Settings> | null>(SETTINGS_KEY, null)
  let s: Partial<Settings>
  if (saved) s = saved
  else {
    const v2 = readJson<Record<string, unknown> | null>('settings', null)
    s = v2 ? migrateV2(v2) : guessFromBrowser()
  }
  const merged = { ...DEFAULTS, ...s }
  if (!isScriptCode(merged.script)) merged.script = DEFAULT_SCRIPT
  return merged
}

/** first visit: pick script and UI language from the browser language */
export function guessFromBrowser(langs: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []): Partial<Settings> {
  const map: Record<string, [string, string]> = {
    si: ['sinh', 'si'], my: ['mymr', 'my'], th: ['thai', 'th'], km: ['khmr', 'kh'], lo: ['laoo', 'en'], hi: ['deva', 'hi'], mr: ['deva', 'hi'],
    ne: ['deva', 'en'], bn: ['beng', 'en'], zh: ['latn', 'ch'], ru: ['cyrl', 'en'], gu: ['gujr', 'en'], te: ['telu', 'en'], kn: ['knda', 'en'],
    ml: ['mlym', 'en'], ta: ['taml', 'en'], pa: ['guru', 'en'], bo: ['tibt', 'en'],
  }
  for (const l of langs) {
    const m = map[l.slice(0, 2).toLowerCase()]
    if (m) return { script: m[0], uiLang: m[1] }
  }
  return {}
}

export const useSettings = defineStore('settings', () => {
  const s = reactive<Settings>(loadSettings())
  watch(s, v => writeJson(SETTINGS_KEY, v), { deep: true, immediate: true })
  watch(() => s.theme, applyTheme, { immediate: true })
  watch(() => [s.textSize, s.leading, s.width] as const, applyText, { immediate: true })
  return s
})

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.className = theme === 'light' ? '' : theme
}

function applyText([size, leading, width]: readonly [number, number, number]) {
  if (typeof document === 'undefined') return
  const st = document.documentElement.style
  st.setProperty('--text-size', `${size}px`)
  st.setProperty('--text-leading', String(leading))
  st.setProperty('--reading-width', `${width}px`)
}
