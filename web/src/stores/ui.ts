import { defineStore } from 'pinia'
import { ref } from 'vue'

/** transient ui state: drawers, the study panel (dictionary / commentary), toasts */
export const useUi = defineStore('ui', () => {
  const treeOpen = ref(typeof window !== 'undefined' && window.innerWidth >= 1200)
  const panelOpen = ref(false)
  const panelTab = ref<'dict' | 'links' | 'info'>('dict')
  /** word being looked up in the study panel (Roman) */
  const lookupWord = ref('')
  /** paragraph whose commentary is shown in the panel */
  const linkTarget = ref<{ key: string; para: number } | null>(null)
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
  function openLookup(word: string) {
    lookupWord.value = word
    panelTab.value = 'dict'
    panelOpen.value = true
  }
  return { treeOpen, panelOpen, panelTab, lookupWord, linkTarget, navInTab, lastPage, toast, showToast, openLookup }
})
