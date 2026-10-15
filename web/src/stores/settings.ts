/**
 * User settings, saved in localStorage 'tipitaka.app-settings-3'. The first run imports the v2 settings
 * ('settings': paliScript si/ro/..., uiLanguage, dictList, ...).
 */
import { defineStore } from 'pinia'
import { reactive, toRefs, watch } from 'vue'
import { LEGACY_SCRIPT, isScriptCode, DEFAULT_SCRIPT } from '@shared/scripts'
import { readJson, writeJson } from './storage'

export const SETTINGS_KEY = 'tipitaka.app-settings-3'

export type Theme = 'light' | 'sepia' | 'dark'
export type NotesMode = 'pointer' | 'inline' | 'hidden'
/** v2 tab views: one text, tabs, or the tabs side by side as columns */
export type TabView = 'single' | 'tabbed' | 'columns'

export interface Settings {
  script: string
  uiLang: string
  theme: Theme
  textSize: number // px, for scripts without their own size
  /** text size per Pāḷi script (px), set when the size is changed while that script is shown */
  textSizes: Record<string, number>
  leading: number
  width: number // reading column px
  notes: NotesMode
  pageRefs: string // editions shown, subset of 'MVPT'
  paraNums: boolean
  /** dictionaries used for lookups ('dpd' + dict codes); empty = all */
  dicts: string[]
  tabView: TabView
  /** scroll linked columns (mūla / commentary) together */
  syncScroll: boolean
  /** height of the dictionary / commentary sheet on phones, % of the screen */
  sheetHeight: number
  /** collections searched (full text and titles): node keys (collection roots, pitaka groups); null = default */
  searchFilter: string[] | null
  /** tap a word to look it up */
  tapLookup: boolean
}

export const DEFAULTS: Settings = {
  script: DEFAULT_SCRIPT, uiLang: 'en', theme: 'light', textSize: 18, textSizes: {}, leading: 1.65, width: 760, notes: 'pointer', pageRefs: '',
  paraNums: true, dicts: [], tabView: 'single', syncScroll: true, sheetHeight: 45, searchFilter: null, tapLookup: true,
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
  if (old.tabViewFormat === 'tabbed' || old.tabViewFormat === 'columns') out.tabView = old.tabViewFormat
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
  // on <html> too: popovers and dialogs are teleported to <body>, outside the app's [data-script]
  watch(() => s.script, v => { if (typeof document !== 'undefined') document.documentElement.setAttribute('data-script', v) }, { immediate: true })
  watch(() => [textSizeOf(s, s.script), s.leading, s.width] as const, applyText, { immediate: true })
  return toRefs(s) // refs: pinia treats them as state (a returned reactive object would be copied)
})

/** the text size of a script: its own size, else the common one */
export function textSizeOf(s: Settings, script: string): number {
  return s.textSizes?.[script] ?? s.textSize
}

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
