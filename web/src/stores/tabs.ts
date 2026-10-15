/**
 * Open texts (v2 tabs). Each tab is a text stream started at `key`; `current`/`para` follow the reading
 * position. The url shows the active tab. Saved in localStorage so the tabs survive a reload.
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { readJson, writeJson } from './storage'

export interface Tab {
  id: number
  /** node the text stream starts at */
  key: string
  /** node / paragraph at the top of the view */
  current: string
  para?: number
  /** paragraph to scroll to once (#p link, search hit) */
  target?: number
  /** words to highlight (search) */
  hl?: string[]
}

export const TABS_KEY = 'tipitaka.app-tabs-3'
export const MAX_TABS = 12

export const useTabs = defineStore('tabs', () => {
  const saved = readJson<{ tabs: Tab[]; active: number } | null>(TABS_KEY, null)
  const tabs = ref<Tab[]>(saved?.tabs?.filter(t => t && t.key) ?? [])
  const activeId = ref(saved && tabs.value.some(t => t.id === saved.active) ? saved.active : tabs.value[0]?.id ?? 0)
  let nextId = Math.max(0, ...tabs.value.map(t => t.id)) + 1
  watch([tabs, activeId], () => writeJson(TABS_KEY, { tabs: tabs.value.map(({ id, key, current, para }) => ({ id, key, current, para })), active: activeId.value }), { deep: true })

  const active = computed(() => tabs.value.find(t => t.id === activeId.value))
  const find = (key: string) => tabs.value.find(t => t.key === key || t.current === key)

  /** open a text: in a new tab (or the tab already showing it), or in the active tab */
  function open(key: string, opts: { newTab: boolean; target?: number; hl?: string[] }) {
    const existing = find(key)
    if (existing && (opts.newTab || existing.id === activeId.value)) {
      activeId.value = existing.id
      if (opts.target !== undefined || opts.hl?.length) Object.assign(existing, { target: opts.target, hl: opts.hl })
      if (existing.current !== key) Object.assign(existing, { key, current: key, para: undefined })
      return existing
    }
    const fresh = { key, current: key, para: undefined, target: opts.target, hl: opts.hl }
    if (!opts.newTab && active.value) {
      Object.assign(active.value, fresh)
      return active.value
    }
    const tab: Tab = { id: nextId++, ...fresh }
    const i = tabs.value.findIndex(t => t.id === activeId.value)
    tabs.value.splice(i + 1, 0, tab)
    if (tabs.value.length > MAX_TABS) tabs.value.splice(tabs.value.findIndex(t => t.id !== tab.id), 1)
    activeId.value = tab.id
    return tab
  }
  function close(id: number) {
    const i = tabs.value.findIndex(t => t.id === id)
    if (i < 0 || tabs.value.length <= 1) return
    tabs.value.splice(i, 1)
    if (activeId.value === id) activeId.value = tabs.value[Math.min(i, tabs.value.length - 1)].id
  }
  /** keep only the active tab (single view) */
  function closeOthers() {
    tabs.value = tabs.value.filter(t => t.id === activeId.value)
  }
  return { tabs, activeId, active, find, open, close, closeOthers }
})
