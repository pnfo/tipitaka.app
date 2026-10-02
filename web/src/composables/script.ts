/**
 * The current Pali script comes from the url (/<script>/...), the settings remember the last one.
 * Text is stored in Roman and converted on display (@pnfo/pali-converter); Roman is shown as stored.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { convert, convertMixed } from '@pnfo/pali-converter'
import { isScriptCode, SCRIPTS } from '@shared/scripts'
import { useSettings } from '@/stores/settings'

const cache = new Map<string, string>()
export function convertTo(text: string, script: string): string {
  if (script === 'latn' || !text) return text
  const k = script + '\u0000' + text
  const hit = cache.get(k)
  if (hit !== undefined) return hit
  const v = convert(text, script, 'latn')
  if (cache.size > 20000) cache.clear()
  cache.set(k, v)
  return v
}

/** user input in any script -> Roman lower case (search, dictionary) */
export function toRoman(input: string): string {
  return convertMixed(input, 'latn').toLowerCase()
}

export function useScript() {
  const route = useRoute()
  const settings = useSettings()
  const script = computed(() => {
    const s = route.params.script as string | undefined
    return isScriptCode(s) ? s : settings.script
  })
  const info = computed(() => SCRIPTS.find(s => s.code === script.value)!)
  const conv = (text: string) => convertTo(text, script.value)
  return { script, info, conv }
}
