<template>
  <div>
    <!-- sub bar: breadcrumb + actions -->
    <div class="sticky top-14 z-20 border-b border-line bg-bg" style="opacity: .98">
      <div class="mx-auto flex max-w-[1400px] items-center gap-1 px-2 py-1.5 sm:px-4">
        <nav class="pali flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-sm text-muted" :aria-label="t('Breadcrumb')" data-testid="breadcrumb">
          <template v-for="(p, i) in crumbs" :key="p.key">
            <IconChevron v-if="i > 0" class="h-3 w-3 shrink-0" />
            <RouterLink :to="{ name: 'read', params: { script, key: p.key } }" class="truncate hover:text-primary" :class="{ 'text-fg': i === crumbs.length - 1 }">{{ conv(p.title) }}</RouterLink>
          </template>
        </nav>
        <template v-if="info && info.book >= 0">
          <button v-if="partners.length" class="icon-btn" :class="{ active: settings.layout === 'parallel' }" :title="t('Parallel view (mūla / commentary)')"
            data-testid="parallel-toggle" @click="settings.layout = settings.layout === 'parallel' ? 'single' : 'parallel'">
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
    </div>

    <div v-if="error" class="mx-auto max-w-reading p-8 text-center">
      <p class="mb-4 text-lg">{{ error }}</p>
      <RouterLink :to="{ name: 'home', params: { script } }" class="btn-primary">{{ t('Home') }}</RouterLink>
    </div>
    <div v-else-if="!info" class="mx-auto max-w-reading space-y-3 p-8" aria-busy="true">
      <div v-for="i in 8" :key="i" class="h-4 animate-pulse rounded bg-surface2" :style="{ width: `${60 + (i * 37) % 40}%` }" />
    </div>

    <!-- groups (pitaka, nikaya ...): contents -->
    <section v-else-if="info.book < 0" class="mx-auto max-w-3xl px-4 py-8">
      <h1 class="pali mb-6 text-center text-3xl font-semibold text-primary">{{ conv(info.title) }}</h1>
      <ul class="grid gap-2 sm:grid-cols-2">
        <li v-for="c in groupChildren" :key="c.key">
          <RouterLink :to="{ name: 'read', params: { script, key: c.key } }" class="card flex items-center gap-3 hover:border-primary" :class="`coll-${c.coll}`">
            <span class="coll-dot" />
            <span class="pali flex-1">{{ conv(c.title) }}</span>
            <IconChevron class="h-4 w-4 text-muted" />
          </RouterLink>
        </li>
      </ul>
    </section>

    <!-- parallel: mūla | commentary -->
    <div v-else-if="parallel" class="mx-auto flex max-w-[1500px] gap-0 md:gap-2" :style="{ height: 'calc(100vh - 6.25rem)' }" data-testid="parallel">
      <div class="min-w-0 flex-1 border-line md:border-r">
        <TextColumn ref="main" :node-key="streamKey" :script="script" :conv="conv" :coll="info.coll" :target="targetPara" :highlight="highlight"
          :linked="linkedMain" contained @visible="onVisible" @word="onWord" @para="onPara" @loaded="onMainLoaded" />
      </div>
      <div class="hidden min-w-0 flex-1 flex-col md:flex">
        <div class="flex items-center gap-2 border-b border-line px-3 py-1.5 text-sm">
          <span class="coll-dot" :class="`coll-${partner?.coll}`" />
          <select :value="partner?.key" class="pali min-w-0 flex-1 truncate bg-transparent outline-none" data-testid="partner-select" @change="partnerKey = ($event.target as HTMLSelectElement).value">
            <option v-for="p in partners" :key="p.key" :value="p.key">{{ conv(p.title) }} ({{ COLL_LABEL[p.coll] }})</option>
          </select>
          <label class="flex items-center gap-1 text-xs text-muted"><input v-model="syncScroll" type="checkbox"> {{ t('Sync') }}</label>
        </div>
        <div class="min-h-0 flex-1">
          <TextColumn v-if="partner" ref="side" :node-key="partner.key" :script="script" :conv="conv" :coll="partner.coll" :target="partnerTarget"
            :linked="linkedSide" contained id-prefix="s" @word="onWord" />
        </div>
      </div>
    </div>

    <!-- single column -->
    <div v-else class="pb-24 pt-2" data-testid="reader">
      <TextColumn ref="main" :node-key="streamKey" :script="script" :conv="conv" :coll="info.coll" :target="targetPara" :highlight="highlight"
        @visible="onVisible" @word="onWord" @para="onPara" @loaded="onMainLoaded">
        <template #end>
          <nav class="mt-10 flex items-center justify-between gap-4 border-t border-line pt-4 font-ui text-sm">
            <span />
            <RouterLink v-if="nextNode" :to="{ name: 'read', params: { script, key: nextNode.key } }" class="btn">
              <span class="pali">{{ conv(nextNode.title) }}</span><IconChevron class="h-4 w-4" />
            </RouterLink>
          </nav>
        </template>
      </TextColumn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useWindowSize } from '@vueuse/core'
import IconChevron from '~icons/lucide/chevron-right'
import IconColumns from '~icons/lucide/columns-2'
import IconBookmark from '~icons/lucide/bookmark'
import IconBookmarkCheck from '~icons/lucide/bookmark-check'
import IconLink from '~icons/lucide/link'
import TextColumn from '@/components/TextColumn.vue'
import { ApiError, useApi } from '@/data/api'
import type { Link, NodeInfo, TNode, Coll } from '@/data/types'
import { toRoman, useScript } from '@/composables/script'
import { useSettings } from '@/stores/settings'
import { useLibrary } from '@/stores/library'
import { useTree } from '@/stores/tree'
import { useUi } from '@/stores/ui'
import { t } from '@/i18n'

const COLL_LABEL: Record<Coll, string> = { mula: 'Mūla', atta: 'Aṭṭhakathā', tika: 'Ṭīkā', anya: 'Añña' }
const route = useRoute(), router = useRouter()
const api = useApi()
const settings = useSettings(), library = useLibrary(), tree = useTree(), ui = useUi()
const { script, conv } = useScript()
const { width } = useWindowSize()

const key = computed(() => route.params.key as string)
/** the node the text stream started at: only changes on navigation, not when the url follows the scroll position */
const streamKey = ref('')
const info = ref<NodeInfo | null>(null)
const visible = ref<{ key: string; para: number } | null>(null)
const visibleInfo = ref<NodeInfo | null>(null)
const error = ref('')
const groupChildren = ref<TNode[]>([])
const main = ref<InstanceType<typeof TextColumn>>()
const side = ref<InstanceType<typeof TextColumn>>()

const targetPara = computed(() => {
  const m = /^#p(\d+)$/.exec(route.hash)
  return m ? +m[1] : undefined
})
const highlight = computed(() => {
  const h = route.query.hl
  return typeof h === 'string' && h ? h.split(' ') : []
})

// the url follows the reading position; such route changes must not reload the text
let syncing = ''
watch(key, async k => {
  if (k === syncing) { syncing = ''; return }
  await load(k)
}, { immediate: true })

async function load(k: string) {
  error.value = ''
  visible.value = null
  visibleInfo.value = null
  try {
    const i = await api.node(k)
    info.value = i
    streamKey.value = k
    tree.reveal(i.path.map(p => p.key), i.key, i.coll)
    if (i.book < 0) groupChildren.value = await api.children(k)
    library.visit({ key: i.key, title: i.title, path: i.bookTitle ?? i.path[i.path.length - 1]?.title ?? '', para: i.start })
    partnerKey.value = ''
  } catch (e) {
    info.value = null
    error.value = e instanceof ApiError && e.code === 'not_found' ? t('This page does not exist.') : t('Could not load the text. Please try again.')
  }
}

const current = computed(() => visibleInfo.value ?? info.value)
const crumbs = computed(() => {
  if (!current.value) return []
  const all = [...current.value.path.filter(p => p.kind !== 'group' || p.depth > 0), current.value]
  return width.value < 640 ? all.slice(-2) : all
})
const nextNode = computed(() => (info.value?.next ? { key: info.value.next, title: nextTitle.value } : null))
const nextTitle = ref('')
watch(() => info.value?.next, async n => { nextTitle.value = n ? (await api.node(n)).title : '' })

async function onVisible(para: number, k: string) {
  visible.value = { key: k, para }
  if (k !== (visibleInfo.value?.key ?? info.value?.key)) {
    try { visibleInfo.value = await api.node(k) } catch { /* ignore */ }
    if (visibleInfo.value && k !== key.value) {
      syncing = k
      router.replace({ name: 'read', params: { script: script.value, key: k }, query: route.query })
      tree.reveal(visibleInfo.value.path.map(p => p.key), k, visibleInfo.value.coll)
    }
  }
  if (parallel.value && syncScroll.value) syncSide(para)
}

useHead({
  title: computed(() => (current.value ? conv(current.value.title) + (current.value.bookTitle && current.value.kind !== 'book' ? ` – ${conv(current.value.bookTitle)}` : '') : '')),
  link: computed(() => (current.value ? [{ rel: 'canonical', href: `https://tipitaka.app/${script.value}/${current.value.key}` }] : [])),
})

// ---------------- parallel view ----------------
const parallel = computed(() => settings.layout === 'parallel' && partners.value.length > 0 && width.value >= 900)
const linkTargets = ref<TNode[]>([]) // commentary nodes found through the paragraph links
const partners = computed<TNode[]>(() => {
  const i = info.value
  if (!i || i.book < 0) return []
  const out: TNode[] = []
  const add = (n?: TNode) => { if (n && !out.some(o => o.key === n.key)) out.push(n) }
  i.commentary.forEach(add)
  add(i.mirrorNode)
  linkTargets.value.forEach(add)
  return out
})
const partnerKey = ref('')
const partner = computed(() => partners.value.find(p => p.key === partnerKey.value) ?? partners.value[0])
const syncScroll = ref(true)
const links = ref<Link[]>([])
const partnerTarget = ref<number | undefined>()
const linkedMain = computed(() => new Set(links.value.map(l => l.i)))
const linkedSide = computed(() => new Set(links.value.filter(l => l.k.startsWith(partner.value?.key ?? '\u0000') || l.b === partner.value?.book).map(l => l.t)))

async function onMainLoaded(from: number, to: number) {
  if (!info.value) return
  try {
    const ls = await api.links(streamKey.value, from, to)
    const seen = new Map(links.value.map(l => [`${l.i}:${l.b}:${l.t}`, l]))
    for (const l of ls) seen.set(`${l.i}:${l.b}:${l.t}`, l)
    links.value = [...seen.values()]
    // nodes on the other side of the links (when the node itself has no mirror)
    if (!info.value.commentary.length && !info.value.mirrorNode && ls.length && !linkTargets.value.length) {
      const k = ls[0].k
      const n = await api.node(k)
      linkTargets.value = [n.path.slice().reverse().find(p => p.kind === 'div' || p.kind === 'book') ?? n]
    }
  } catch { /* links are optional */ }
}
watch(streamKey, () => { links.value = []; linkTargets.value = [] })

let syncTimer: ReturnType<typeof setTimeout> | undefined
function syncSide(para: number) {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    const b = partner.value?.book
    const cands = links.value.filter(l => l.b === b && l.i >= para).sort((x, y) => x.i - y.i)
    const l = cands[0]
    if (l) side.value?.scrollToPara(l.t)
  }, 120)
}

// ---------------- interactions ----------------
function onWord(shown: string) {
  ui.openLookup(toRoman(shown))
}
function onPara(para: number) {
  ui.panelTab = 'links'
  ui.panelOpen = true
  linkPara.value = { key: visible.value?.key ?? key.value, para }
}
const linkPara = ref<{ key: string; para: number } | null>(null)
watch(linkPara, v => { if (v) ui.linkTarget = v })

const bookmarked = computed(() => !!current.value && library.isBookmarked(current.value.key))
function toggleBookmark() {
  const c = current.value
  if (!c) return
  library.toggleBookmark({ key: c.key, para: visible.value?.para ?? c.start, title: c.title, path: c.bookTitle ?? '' })
  ui.showToast(library.isBookmarked(c.key) ? t('Bookmark added') : t('Bookmark removed'))
}
async function share() {
  const c = current.value
  if (!c) return
  const url = `https://tipitaka.app/${script.value}/${c.key}${visible.value && visible.value.para !== c.start ? `#p${visible.value.para}` : ''}`
  try {
    if (window.TipitakaNative?.share) window.TipitakaNative.share(url)
    else await navigator.clipboard.writeText(url)
    ui.showToast(t('Link copied'))
  } catch { ui.showToast(url) }
}
</script>
