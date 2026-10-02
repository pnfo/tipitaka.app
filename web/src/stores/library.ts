/**
 * Bookmarks and reading history (localStorage). v2 bookmarks ('bookmarks': {"<fileId>,<line>": time})
 * are converted on first use through the engine's legacy map.
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { readJson, removeKey, writeJson } from './storage'
import type { Api } from '@/data/api'

export interface Bookmark { key: string; para: number; title: string; path: string; added: number; note?: string }
export interface HistoryItem { key: string; title: string; path: string; para: number; at: number }

export const BOOKMARKS_KEY = 'tipitaka.app-bookmarks-3'
export const HISTORY_KEY = 'tipitaka.app-history-3'
const MAX_HISTORY = 40

export const useLibrary = defineStore('library', () => {
  const bookmarks = ref<Bookmark[]>(readJson(BOOKMARKS_KEY, []))
  const history = ref<HistoryItem[]>(readJson(HISTORY_KEY, []))
  watch(bookmarks, v => writeJson(BOOKMARKS_KEY, v), { deep: true })
  watch(history, v => writeJson(HISTORY_KEY, v), { deep: true })

  const isBookmarked = (key: string, para?: number) => bookmarks.value.some(b => b.key === key && (para === undefined || b.para === para))
  function toggleBookmark(b: Omit<Bookmark, 'added'>) {
    const i = bookmarks.value.findIndex(x => x.key === b.key && x.para === b.para)
    if (i >= 0) bookmarks.value.splice(i, 1)
    else bookmarks.value.unshift({ ...b, added: Date.now() })
  }
  function removeBookmark(b: Bookmark) {
    bookmarks.value = bookmarks.value.filter(x => x !== b)
  }
  function visit(item: Omit<HistoryItem, 'at'>) {
    const rest = history.value.filter(h => h.key !== item.key)
    history.value = [{ ...item, at: Date.now() }, ...rest].slice(0, MAX_HISTORY)
  }
  function clearHistory() { history.value = [] }

  /** import the v2 bookmarks once (they are removed from storage when converted) */
  async function migrateV2(api: Api) {
    const old = readJson<Record<string, number> | null>('bookmarks', null)
    if (!old || typeof old !== 'object') return 0
    let n = 0
    for (const [loc, time] of Object.entries(old)) {
      const [file, line] = loc.split(',')
      try {
        const t = await api.legacy(file, +line || 0)
        const info = await api.node(t.key)
        if (!isBookmarked(t.key, t.para)) {
          bookmarks.value.push({ key: t.key, para: t.para, title: info.title, path: info.bookTitle ?? '', added: +time || Date.now() })
          n++
        }
      } catch { /* not mapped */ }
    }
    bookmarks.value.sort((a, b) => b.added - a.added)
    removeKey('bookmarks')
    return n
  }
  return { bookmarks, history, isBookmarked, toggleBookmark, removeBookmark, visit, clearHistory, migrateV2 }
})
