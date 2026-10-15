<!--
  The reader: open texts as tabs (v2 tab views: single / tabs / columns side by side). The url shows the active
  tab; links from the tree, search, home ... open a new tab (tabs and columns views) or replace the text (single).
  Linked columns (mūla / aṭṭhakathā / ṭīkā) scroll together.
-->
<template>
  <div>
    <!-- sub bar: breadcrumb + actions -->
    <div class="sticky top-14 z-20 border-b border-line bg-bg" style="opacity: .98">
      <div class="mx-auto flex max-w-[1500px] items-center gap-1 px-2 py-1.5 sm:px-4">
        <nav class="pali flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-sm text-muted" :aria-label="t('Breadcrumb')" data-testid="breadcrumb">
          <template v-for="(p, i) in crumbs" :key="p.key">
            <IconChevron v-if="i > 0" class="h-3 w-3 shrink-0" />
            <RouterLink :to="{ name: 'read', params: { script, key: p.key } }" class="truncate hover:text-primary" :class="{ 'text-fg': i === crumbs.length - 1 }"
              @click="ui.navInTab = true">{{ conv(p.title) }}</RouterLink>
          </template>
        </nav>
        <template v-if="current && current.book >= 0">
          <button v-if="partners.length" ref="commBtn" class="icon-btn" :title="t('Open the commentary alongside')" data-testid="commentary-btn" @click="commOpen = !commOpen">
            <IconColumns class="h-5 w-5" />
          </button>
          <button class="icon-btn" :class="{ active: bookmarked }" :title="t('Bookmark')" data-testid="bookmark-btn" @click="toggleBookmark">
            <IconBookmarkCheck v-if="bookmarked" class="h-5 w-5" />
            <IconBookmark v-else class="h-5 w-5" />
          </button>
          <button class="icon-btn" :title="t('Copy link')" data-testid="share-btn" @click="share">
            <IconLink class="h-5 w-5" />
          </button>
        </template>
      </div>
      <!-- tab bar -->
      <div v-if="tabs.tabs.length > 1" class="mx-auto flex max-w-[1500px] items-center gap-1 overflow-x-auto px-2 pb-1.5 sm:px-4" role="tablist" data-testid="tab-bar">
        <div v-for="tb in tabs.tabs" :key="tb.id" role="tab" :aria-selected="tb.id === tabs.activeId" :class="[`coll-${titles[tb.id]?.coll ?? 'mula'}`,
          tb.id === tabs.activeId ? 'border-primary bg-primary-soft text-fg' : 'border-line text-muted hover:bg-surface2']"
          class="flex max-w-[14rem] shrink-0 cursor-pointer items-center rounded-full border py-0.5 pl-2.5 pr-1 text-xs" data-testid="tab" @click="activate(tb.id)">
          <span class="coll-dot mr-1.5" />
          <span class="pali truncate">{{ conv(titles[tb.id]?.title ?? tb.current) }}</span>
          <button class="ml-1 rounded-full p-0.5 hover:bg-surface2" :aria-label="t('Close')" data-testid="tab-close" @click.stop="closeTab(tb.id)"><IconX class="h-3.5 w-3.5" /></button>
        </div>
        <span class="flex-1" />
        <div v-if="wide" class="flex shrink-0 rounded-full border border-line p-0.5" role="group" :aria-label="t('Tab view')">
          <button class="rounded-full px-2 py-0.5 text-xs" :class="view === 'tabbed' ? 'bg-primary-soft text-primary' : 'text-muted'" data-testid="view-tabbed" @click="settings.tabView = 'tabbed'">{{ t('Tabs') }}</button>
          <button class="rounded-full px-2 py-0.5 text-xs" :class="view === 'columns' ? 'bg-primary-soft text-primary' : 'text-muted'" data-testid="view-columns" @click="settings.tabView = 'columns'">{{ t('Columns') }}</button>
        </div>
      </div>
    </div>

    <Floating :open="commOpen" :anchor="commBtn ?? null" align="end" @close="commOpen = false">
      <div class="w-72">
        <div class="section-title px-1">{{ t('Open alongside') }}</div>
        <button v-for="p in partners" :key="p.key" class="menu-item" :class="`coll-${p.coll}`" data-testid="partner" @click="openPartner(p)">
          <span class="coll-dot" /><span class="pali min-w-0 flex-1 truncate">{{ conv(p.title) }}</span><span class="text-xs text-muted">{{ COLL_LABEL[p.coll] }}</span>
        </button>
      </div>
    </Floating>

    <!-- columns: every tab side by side -->
    <div v-if="showColumns" class="mx-auto flex max-w-[1800px]" :style="{ height: 'calc(100vh - 6.25rem - 2rem)' }" data-testid="columns">
      <div v-for="tb in tabs.tabs" :key="tb.id" class="min-w-0 flex-1 border-r border-line last:border-r-0">
        <ReaderPane :ref="el => setPane(tb.id, el)" :tab="tb" contained :active="tb.id === tabs.activeId" closable
          @info="i => onInfo(tb.id, i)" @visible="(k, p, i) => onVisible(tb.id, k, p, i)" @word="onWord" @para="onPara"
          @activate="activate(tb.id)" @close="closeTab(tb.id)" />
      </div>
    </div>
    <!-- the active tab -->
    <ReaderPane v-else-if="tabs.active" :key="tabs.active.id" :ref="el => setPane(tabs.activeId, el)" :tab="tabs.active" active
      @info="i => onInfo(tabs.activeId, i)" @visible="(k, p, i) => onVisible(tabs.activeId, k, p, i)" @word="onWord" @para="onPara" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useWindowSize } from '@vueuse/core'
import IconChevron from '~icons/lucide/chevron-right'
import IconColumns from '~icons/lucide/columns-2'
import IconBookmark from '~icons/lucide/bookmark'
import IconBookmarkCheck from '~icons/lucide/bookmark-check'
import IconLink from '~icons/lucide/link'
import IconX from '~icons/lucide/x'
import ReaderPane from '@/components/ReaderPane.vue'
import Floating from '@/components/Floating.vue'
import { useApi } from '@/data/api'
import type { NodeInfo, TNode, Coll } from '@/data/types'
import { toRoman, useScript } from '@/composables/script'
import { useSettings } from '@/stores/settings'
import { useLibrary } from '@/stores/library'
import { useTabs } from '@/stores/tabs'
import { useTree } from '@/stores/tree'
import { useUi } from '@/stores/ui'
import { t } from '@/i18n'

const COLL_LABEL: Record<Coll, string> = { mula: 'Mūla', atta: 'Aṭṭhakathā', tika: 'Ṭīkā', anya: 'Añña' }
const route = useRoute(), router = useRouter()
const api = useApi()
const settings = useSettings(), library = useLibrary(), tree = useTree(), ui = useUi(), tabs = useTabs()
const { script, conv } = useScript()
const { width } = useWindowSize()
const wide = computed(() => width.value >= 900)

/** the effective view: columns need room, single shows one text */
const view = computed(() => settings.tabView)
const showColumns = computed(() => view.value === 'columns' && wide.value && tabs.tabs.length > 1)

// per tab: what is shown at the top of the view (title for the tab bar, info for the breadcrumb)
const titles = reactive<Record<number, { title: string; coll: Coll }>>({})
const currentInfo = reactive<Record<number, NodeInfo>>({})
const current = computed(() => currentInfo[tabs.activeId] ?? null)

const panes = new Map<number, InstanceType<typeof ReaderPane>>()
function setPane(id: number, el: Element | ComponentPublicInstance | null) {
  if (el) panes.set(id, el as InstanceType<typeof ReaderPane>)
  else panes.delete(id)
}

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
  // the text is already open: just scroll
  const t0 = targetOf(hash)
  if (t0 !== undefined) panes.get(tab.id)?.scrollToPara(t0)
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
watch(view, v => { if (v === 'single') tabs.closeOthers() })

function onInfo(id: number, i: NodeInfo) {
  titles[id] = { title: i.title, coll: i.coll }
  if (!currentInfo[id] || currentInfo[id].key !== tabs.tabs.find(t => t.id === id)?.current) currentInfo[id] = i
  if (id === tabs.activeId) {
    tree.reveal(i.path.map(p => p.key), i.key, i.coll)
    library.visit({ key: i.key, title: i.title, path: i.bookTitle ?? i.path[i.path.length - 1]?.title ?? '', para: i.start })
  }
}

function onVisible(id: number, key: string, para: number, info: NodeInfo) {
  const tb = tabs.tabs.find(t => t.id === id)
  if (!tb) return
  const moved = tb.current !== key
  tb.current = key
  tb.para = para
  currentInfo[id] = info
  titles[id] = { title: info.title, coll: info.coll }
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

useHead({
  title: computed(() => (current.value ? conv(current.value.title) + (current.value.bookTitle && current.value.kind !== 'book' ? ` – ${conv(current.value.bookTitle)}` : '') : '')),
  link: computed(() => (current.value ? [{ rel: 'canonical', href: `https://tipitaka.app/${script.value}/${current.value.key}` }] : [])),
})

const crumbs = computed(() => {
  if (!current.value) return []
  const all = [...current.value.path.filter(p => p.kind !== 'group' || p.depth > 0), current.value]
  return width.value < 640 ? all.slice(-2) : all
})

// ---------------- commentary alongside ----------------
const commOpen = ref(false)
const commBtn = ref<HTMLElement>()
const linkedNodes = ref<TNode[]>([])
const partners = computed<TNode[]>(() => {
  const i = current.value
  if (!i || i.book < 0) return []
  const out: TNode[] = []
  const add = (n?: TNode) => { if (n && !out.some(o => o.key === n.key) && !tabs.find(n.key)) out.push(n) }
  i.commentary.forEach(add)
  add(i.mirrorNode)
  linkedNodes.value.forEach(add)
  return out
})
// nodes on the other side of the paragraph links (when the node itself has no mirror / commentary)
watch(() => current.value?.key, async () => {
  linkedNodes.value = []
  const i = current.value
  if (!i || i.commentary.length || i.mirrorNode || i.book < 0) return
  try {
    const ls = await api.links(i.key, i.start, Math.min(i.end, i.start + 50))
    const seen = new Set<string>()
    for (const l of ls.slice(0, 20)) {
      const n = await api.node(l.k)
      const top = n.path.slice().reverse().find(p => p.kind === 'div' || p.kind === 'book') ?? n
      if (!seen.has(top.key)) { seen.add(top.key); linkedNodes.value.push(top) }
    }
  } catch { /* optional */ }
})
function openPartner(p: TNode) {
  commOpen.value = false
  if (view.value === 'single') settings.tabView = wide.value ? 'columns' : 'tabbed'
  const from = tabs.activeId
  const para = tabs.active?.para
  const tab = tabs.open(p.key, { newTab: true })
  // start the commentary at the paragraph linked to the reading position
  const target = para !== undefined ? panes.get(from)?.linkTarget(para, p.book) : undefined
  if (target !== undefined) tab.target = target
  if (!wide.value) syncRoute(tab.current)
  else tabs.activeId = from
}

// ---------------- interactions ----------------
function onWord(shown: string) {
  ui.openLookup(toRoman(shown))
}
function onPara(para: number, key: string) {
  ui.panelTab = 'links'
  ui.panelOpen = true
  ui.linkTarget = { key, para }
}

const bookmarked = computed(() => !!current.value && library.isBookmarked(current.value.key))
function toggleBookmark() {
  const c = current.value
  if (!c) return
  library.toggleBookmark({ key: c.key, para: tabs.active?.para ?? c.start, title: c.title, path: c.bookTitle ?? '' })
  ui.showToast(library.isBookmarked(c.key) ? t('Bookmark added') : t('Bookmark removed'))
}
async function share() {
  const c = current.value
  if (!c) return
  const para = tabs.active?.para
  const url = `https://tipitaka.app/${script.value}/${c.key}${para !== undefined && para !== c.start ? `#p${para}` : ''}`
  try {
    if (window.TipitakaNative?.share) window.TipitakaNative.share(url)
    else await navigator.clipboard.writeText(url)
    ui.showToast(t('Link copied'))
  } catch { ui.showToast(url) }
}
</script>
