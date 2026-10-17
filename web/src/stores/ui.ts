import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Gloss } from '@/data/types'

/** transient ui state: drawers, the study panel (dictionary / commentary), toasts */
export const useUi = defineStore('ui', () => {
  const treeOpen = ref(typeof window !== 'undefined' && window.innerWidth >= 1200)
  const panelOpen = ref(false)
  const panelTab = ref<'dict' | 'links' | 'info'>('dict')
  /** word being looked up in the study panel (Roman) */
  const lookupWord = ref('')
  /** commentary alignment of the looked up word (its underline): the Commentary tab shows its explanation */
  const lookupGlosses = ref<Gloss[]>([])
  /** request to open a text next to the current one (from the study panel; handled by the reader) */
  const alongside = ref<{ key: string; para: number } | null>(null)
  /** paragraph whose commentary is shown in the panel */
  const linkTarget = ref<{ key: string; para: number } | null>(null)
  /** paragraph whose setting (place, people) is shown in the panel's Setting tab: the reading position, a tapped
   * word's paragraph, or the paragraph of the menu */
  const settingTarget = ref<{ key: string; para: number } | null>(null)
  /** the next navigation comes from inside a tab (breadcrumb, next): it replaces the text instead of opening a tab */
  const navInTab = ref(false)
  /** the last page that was not the settings (the settings button goes back to it) */
  const lastPage = ref('')
  const toast = ref<{ msg: string; id: number } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  function showToast(msg: string) {
    toast.value = { msg, id: Date.now() }
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = null }, 2500)
  }
  /**
   * a tapped word: the dictionary, the explanation of its underline (glosses), and its paragraph (the commentary
   * tab falls back to the paragraph's commentary). An open panel stays on its tab: reading the commentary word by
   * word keeps showing the commentary.
   */
  function openLookup(word: string, glosses: Gloss[] = [], para?: { key: string; para: number }) {
    lookupWord.value = word
    lookupGlosses.value = glosses
    // the Setting tab shows the setting of the tapped word's paragraph
    if (para) { linkTarget.value = para; settingTarget.value = para }
    if (!panelOpen.value || !word) panelTab.value = word ? 'dict' : 'links'
    panelOpen.value = true
  }
  /** the commentary of a whole paragraph (paragraph menu) */
  function openParaCommentary(para: { key: string; para: number }) {
    linkTarget.value = para
    lookupGlosses.value = []
    panelTab.value = 'links'
    panelOpen.value = true
  }
  /** where the sutta / story of a paragraph was taught and who was there (paragraph menu) */
  function openSetting(para: { key: string; para: number }) {
    settingTarget.value = para
    panelTab.value = 'info'
    panelOpen.value = true
  }
  return { treeOpen, panelOpen, panelTab, lookupWord, lookupGlosses, alongside, linkTarget, settingTarget, navInTab, lastPage, toast, showToast,
    openLookup, openParaCommentary, openSetting }
})
