/**
 * User settings, saved in localStorage 'tipitaka.app-settings-3'. The first run imports the v2 settings
 * ('settings': paliScript si/ro/..., uiLanguage, dictList, ...).
 */
import { defineStore } from 'pinia'
import { reactive, toRefs, watch } from 'vue'
import { LEGACY_SCRIPT, isScriptCode, DEFAULT_SCRIPT } from '@shared/scripts'
import { readJson, writeJson } from './storage'

export const SETTINGS_KEY = 'tipitaka.app-settings-3'

/** auto: light or dark as the system (prefers-color-scheme) */
export type Theme = 'light' | 'sepia' | 'green' | 'dark' | 'auto'
export type NotesMode = 'pointer' | 'inline' | 'hidden'
/** v2 tab views: one text, tabs, or the tabs side by side as columns */
export type TabView = 'single' | 'tabbed' | 'columns'

export interface Settings {
  script: string
  uiLang: string
  theme: Theme
  /** reading text px; the interface scales with it (UI_SCALE) */
  textSize: number
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
  /** underline the words explained in the commentaries (and the commentaries' lemmas) */
  glosses: boolean
  /** small screens: the header slides away when scrolling down, back when scrolling up */
  autoHideHeader: boolean
  /** wide screens: the menu (components/NavPane.vue) stays open as a column, when the text keeps enough room */
  navPinned: boolean
}

export const DEFAULTS: Settings = {
  script: DEFAULT_SCRIPT, uiLang: 'en', theme: 'light', textSize: 18, leading: 1.65, width: 760, notes: 'pointer', pageRefs: '',
  paraNums: true, dicts: [], tabView: 'single', syncScroll: true, sheetHeight: 45, searchFilter: null, tapLookup: true,
  glosses: true, autoHideHeader: true, navPinned: true,
}

/** dictionaries replaced by a newer edition: old code -> new code */
export const RENAMED_DICTS: Record<string, string> = { 'en-buddhadatta': 'en-ncped' }
const renameDicts = (codes: string[]) => [...new Set(codes.map(c => RENAMED_DICTS[c] ?? c))]

/** v2 settings -> v3 (scripts/settings.js keys) */
export function migrateV2(old: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {}
  const script = LEGACY_SCRIPT[String(old.paliScript ?? '')]
  if (script) out.script = script
  const ui = String(old.uiLanguage ?? '')
  if (['en', 'si', 'my', 'th', 'kh', 'hi', 'ch'].includes(ui)) out.uiLang = ui
  if (old.colorTheme === 'dark') out.theme = 'dark'
  if (Array.isArray(old.dictList) && old.dictList.length) out.dicts = renameDicts(['dpd', ...(old.dictList as string[])])
  if (old.tabViewFormat === 'tabbed' || old.tabViewFormat === 'columns') out.tabView = old.tabViewFormat
  if (old.footnoteFormat === 'none' || old.footnoteFormat === 'hidden') out.notes = 'hidden' // v2: 'none' (Do Not Show)
  else if (old.footnoteFormat === 'inline') out.notes = 'inline'
  return out
}

/** no settings were saved yet (neither v3 nor v2): a new visitor (App.vue asks for the country's defaults) */
export let firstVisit = false

export function loadSettings(): Settings {
  const saved = readJson<Partial<Settings> | null>(SETTINGS_KEY, null)
  let s: Partial<Settings>
  if (saved) s = saved
  else {
    const v2 = readJson<Record<string, unknown> | null>('settings', null)
    firstVisit = !v2
    s = v2 ? migrateV2(v2) : guessFromBrowser()
  }
  const merged = { ...DEFAULTS, ...s }
  delete (merged as { textSizes?: unknown }).textSizes // per script sizes (v3 beta), dropped
  if (!isScriptCode(merged.script)) merged.script = DEFAULT_SCRIPT
  if (Array.isArray(merged.dicts)) merged.dicts = renameDicts(merged.dicts)
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
  onSystemDark(() => applyTheme(s.theme)) // auto follows the system when it switches
  // on <html> too: popovers and dialogs are teleported to <body>, outside the app's [data-script]
  watch(() => s.script, v => { if (typeof document !== 'undefined') document.documentElement.setAttribute('data-script', v) }, { immediate: true })
  watch(() => [s.textSize, s.leading, s.width] as const, applyText, { immediate: true })
  return toRefs(s) // refs: pinia treats them as state (a returned reactive object would be copied)
})

const systemDark = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
function onSystemDark(f: () => void) {
  if (!systemDark) return
  if (systemDark.addEventListener) systemDark.addEventListener('change', f)
  else systemDark.addListener(f) // old webviews
}

/** the class of <html> for a theme (not "sepia": that is also Tailwind's filter utility, a sepia filter over the page) */
export function themeClass(theme: Theme, dark = !!systemDark?.matches): string {
  const t = theme === 'auto' ? (dark ? 'dark' : 'light') : theme
  return t === 'light' ? '' : t === 'dark' ? 'dark' : `theme-${t}`
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.className = themeClass(theme)
}

/**
 * How much the interface follows the text size: the root font size (all rem sizes: tree, dictionary, menus,
 * buttons) changes by this share of the text size change, e.g. text 18 → 24px (+33%): interface 16 → 20px (+25%).
 */
export const UI_SCALE = 0.75
export const uiFontSize = (textSize: number) => Math.round(16 * (1 + (textSize / DEFAULTS.textSize - 1) * UI_SCALE) * 100) / 100

function applyText([size, leading, width]: readonly [number, number, number]) {
  if (typeof document === 'undefined') return
  const st = document.documentElement.style
  st.fontSize = `${uiFontSize(size)}px`
  st.setProperty('--text-size', `${size}px`)
  st.setProperty('--text-leading', String(leading))
  st.setProperty('--reading-width', `${width}px`)
}
