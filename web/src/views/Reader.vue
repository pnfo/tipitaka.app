<!--
  The reader: open texts as tabs (v2 tab views: single / tabs / columns side by side). The url shows the active
  tab; links from the tree, search, home ... open a new tab (tabs and columns views) or replace the text (single).
  Paragraph options (link, copy, commentary alongside, bookmark) are in the dots menu of each paragraph / heading.
  Linked columns (mūla / aṭṭhakathā / ṭīkā) scroll together.
-->
<template>
  <div>
    <TabsBar v-if="tabs.tabs.length > 1 || view !== 'single'" class="sticky top-14 z-20" @activate="activate" @close="closeTab" @close-others="closeOthers" />

    <!-- columns: every tab side by side -->
    <div v-if="showColumns" class="mx-auto flex max-w-[1800px]" :style="{ height: 'calc(100vh - 6rem)' }" data-testid="columns">
      <div v-for="tb in tabs.tabs" :key="tb.id" class="min-w-0 flex-1 border-r border-line last:border-r-0">
        <ReaderPane :ref="el => setPane(tb.id, el)" :tab="tb" contained :active="tb.id === tabs.activeId" closable
          @info="i => onInfo(tb.id, i)" @visible="(k, p, i) => onVisible(tb.id, k, p, i)" @word="onWord" @alongside="openAlongside"
          @activate="activate(tb.id)" @close="closeTab(tb.id)" />
      </div>
    </div>
    <!-- the active tab -->
    <ReaderPane v-else-if="tabs.active" :key="tabs.active.id" :ref="el => setPane(tabs.activeId, el)" :tab="tabs.active" active
      @info="i => onInfo(tabs.activeId, i)" @visible="(k, p, i) => onVisible(tabs.activeId, k, p, i)" @word="onWord" @alongside="openAlongside" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useWindowSize } from '@vueuse/core'
import ReaderPane from '@/components/ReaderPane.vue'
import TabsBar from '@/components/TabsBar.vue'
import { useApi } from '@/data/api'
import type { NodeInfo } from '@/data/types'
import { toRoman, useScript } from '@/composables/script'
import { useSettings } from '@/stores/settings'
import { useLibrary } from '@/stores/library'
import { useTabs } from '@/stores/tabs'
import { useTree } from '@/stores/tree'
import { useUi } from '@/stores/ui'

const route = useRoute(), router = useRouter()
const api = useApi()
const settings = useSettings(), library = useLibrary(), tree = useTree(), ui = useUi(), tabs = useTabs()
const { script, conv } = useScript()
const { width } = useWindowSize()
const wide = computed(() => width.value >= 900)

const view = computed(() => settings.tabView)
const showColumns = computed(() => view.value === 'columns' && wide.value && tabs.tabs.length > 1)

// per tab: the node at the top of the view (page title, tree)
const currentInfo = reactive<Record<number, NodeInfo>>({})
const current = computed(() => currentInfo[tabs.activeId] ?? null)

const panes = new Map<number, InstanceType<typeof ReaderPane>>()
function setPane(id: number, el: Element | ComponentPublicInstance | null) {
  if (el) panes.set(id, el as InstanceType<typeof ReaderPane>)
  else panes.delete(id)
}

// tab names: tabs restored from storage or opened in the background have no title yet
watch(() => tabs.tabs.filter(t => !t.title).map(t => t.current), async keys => {
  for (const k of keys) {
    try {
      const n = await api.node(k)
      for (const tb of tabs.tabs) if (tb.current === k && !tb.title) Object.assign(tb, { title: n.title, coll: n.coll })
    } catch { /* unknown key */ }
  }
}, { immediate: true })

// ---------------- route <-> tabs ----------------
const targetOf = (hash: string) => { const m = /^#p(\d+)$/.exec(hash); return m ? +m[1] : undefined }
let syncing = '' // route changes made by the reader itself (reading position, tab switch)
watch(() => [route.params.key as string, route.hash, route.query.hl] as const, ([key, hash, hl]) => {
  if (!key) return
  if (key === syncing) { syncing = ''; return }
  const newTab = view.value !== 'single' && !ui.navInTab && tabs.tabs.length > 0
  ui.navInTab = false
  const tab = tabs.open(key, { newTab, target: targetOf(hash), hl: typeof hl === 'string' && hl ? hl.split(' ') : undefined })
  if (view.value === 'single' && tabs.tabs.length > 1) tabs.closeOthers()
  const t0 = targetOf(hash)
  if (t0 !== undefined) panes.get(tab.id)?.scrollToPara(t0) // the text is already open: just scroll
}, { immediate: true })

function syncRoute(key: string, para?: number) {
  if (key === route.params.key) return
  syncing = key
  router.replace({ name: 'read', params: { script: script.value, key }, hash: para !== undefined ? `#p${para}` : '' })
}

function activate(id: number) {
  tabs.activeId = id
  const tb = tabs.active
  if (tb) syncRoute(tb.current, tb.para)
}
function closeTab(id: number) {
  tabs.close(id)
  activate(tabs.activeId)
}
function closeOthers() {
  tabs.closeOthers()
  activate(tabs.activeId)
}
watch(view, v => { if (v === 'single') tabs.closeOthers() })

function onInfo(id: number, i: NodeInfo) {
  const tb = tabs.tabs.find(t => t.id === id)
  if (tb && (!currentInfo[id] || currentInfo[id].key !== tb.current)) {
    currentInfo[id] = i
    Object.assign(tb, { title: i.title, coll: i.coll })
  }
  if (id === tabs.activeId) {
    tree.reveal(i.path.map(p => p.key), i.key, i.coll)
    library.visit({ key: i.key, title: i.title, path: i.bookTitle ?? i.path[i.path.length - 1]?.title ?? '', para: i.start })
  }
}

function onVisible(id: number, key: string, para: number, info: NodeInfo) {
  const tb = tabs.tabs.find(t => t.id === id)
  if (!tb) return
  const moved = tb.current !== key
  Object.assign(tb, { current: key, para, title: info.title, coll: info.coll })
  currentInfo[id] = info
  if (id === tabs.activeId && moved) {
    syncRoute(key)
    tree.reveal(info.path.map(p => p.key), key, info.coll)
  }
  if (showColumns.value && settings.syncScroll) syncColumns(id, para)
}

// linked columns follow the scrolled one
let syncTimer: ReturnType<typeof setTimeout> | undefined
let syncSource = -1
function syncColumns(id: number, para: number) {
  if (syncSource >= 0 && syncSource !== id) return // the reaction of a synced column
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    const src = panes.get(id)
    if (!src) return
    syncSource = id
    for (const [other, pane] of panes) {
      if (other === id) continue
      const target = src.linkTarget(para, pane.book())
      if (target !== undefined) pane.scrollToPara(target)
    }
    setTimeout(() => { syncSource = -1 }, 400)
  }, 150)
}

/** open the commentary / mūla of a paragraph next to the text (columns on wide screens, a tab otherwise) */
function openAlongside(key: string, para: number | undefined) {
  if (view.value === 'single') settings.tabView = wide.value ? 'columns' : 'tabbed'
  const from = tabs.activeId
  const tab = tabs.open(key, { newTab: true, target: para })
  if (wide.value) tabs.activeId = from
  else syncRoute(tab.current, para)
}

useHead({
  title: computed(() => (current.value ? conv(current.value.title) + (current.value.bookTitle && current.value.kind !== 'book' ? ` – ${conv(current.value.bookTitle)}` : '') : '')),
  link: computed(() => (current.value ? [{ rel: 'canonical', href: `https://tipitaka.app/${script.value}/${current.value.key}` }] : [])),
})

function onWord(shown: string) {
  ui.openLookup(toRoman(shown))
}
</script>
