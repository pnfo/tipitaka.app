/**
 * UI translations. Strings are written in English in the code (t('Settings')); <lang>.json maps the English
 * text to the translation (imported from v2 by scripts/import-translations.mjs). Missing strings fall back to
 * English, `npm run i18n:missing` lists them.
 */
import { ref } from 'vue'

export const UI_LANGS: { code: string; name: string }[] = [
  { code: 'en', name: 'English' }, { code: 'si', name: 'සිංහල' }, { code: 'my', name: 'မြန်မာ' }, { code: 'th', name: 'ไทย' },
  { code: 'kh', name: 'ខ្មែរ' }, { code: 'hi', name: 'हिन्दी' }, { code: 'ch', name: '中文' },
]

const loaders = import.meta.glob<{ default: Record<string, string> }>('./*.json')
const current = ref<Record<string, string>>({})
export const uiLang = ref('en')

export async function setUiLang(code: string) {
  uiLang.value = code
  // the interface font follows the language (styles/fonts.css)
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-ui-lang', code)
  if (code === 'en') { current.value = {}; return }
  const load = loaders[`./${code}.json`]
  current.value = load ? (await load()).default : {}
}

/** translate; {0} {1} are replaced by the arguments */
export function t(en: string, ...args: (string | number)[]): string {
  let s = current.value[en] || en
  args.forEach((a, i) => { s = s.replace(`{${i}}`, String(a)) })
  return s
}
