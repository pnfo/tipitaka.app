<!--
  A book as a continuous stream: starts at a node (or a target paragraph) and loads more paragraphs when
  scrolling down (and on request above). Scrolls the window, or its own container when `contained` (parallel view).
  Emits the paragraph at the top of the view (url / breadcrumb sync, parallel sync).
-->
<template>
  <div ref="root" :class="contained ? 'h-full overflow-y-auto overscroll-contain' : ''" @scroll.passive="onScroll">
    <div class="reading relative mx-auto max-w-reading pl-6 pr-4 sm:px-6" :class="`coll-${coll}`" @click="onClick">
      <div v-if="from > 0" class="flex justify-center py-3 font-ui">
        <button class="btn text-muted" :disabled="loadingPrev" data-testid="load-prev" @click="loadPrev"><IconUp class="h-4 w-4" />{{ t('Show previous text') }}</button>
      </div>
      <!-- every paragraph / verse / heading has an options button (tipitaka.lk): shown on hover, on touch screens after a tap -->
      <div v-for="p in paras" :key="p.i" class="para-wrap" :class="{ 'menu-open': menuFor === p.i, tapped: tapped === p.i }">
        <div :id="`${idPrefix}p${p.i}`" :data-i="p.i" :data-k="p.k" :class="[paraClass(p), { target: p.i === target, linked: linked?.has(p.i) }]" v-html="render(p)" />
        <button class="para-dots" :aria-label="t('Options')" data-testid="para-options" @click.stop="openMenu(p.i, $event.currentTarget as HTMLElement)">
          <IconDots class="h-3.5 w-3.5" />
        </button>
      </div>
      <div v-if="loadingNext" class="py-6 text-center text-sm text-muted">{{ t('Loading…') }}</div>
      <div ref="bottomSentinel" class="h-1" />
      <slot v-if="book && to >= book.paraCount" name="end" />
    </div>
    <Floating :open="!!note" :anchor="note?.el ?? null" @close="note = null">
      <div class="reading max-w-xs" style="font-size: calc(var(--text-size) * 0.9)" v-html="note?.html" />
    </Floating>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { noteTexts, markupToHtml } from '@shared/markup'
import IconUp from '~icons/lucide/chevrons-up'
import IconDots from '~icons/lucide/ellipsis'
import Floating from './Floating.vue'
import { useApi } from '@/data/api'
import type { Book, Para } from '@/data/types'
import { useSettings } from '@/stores/settings'
import { paraClass, paraHtml, wordAtPoint, wordsRegex } from '@/composables/text'
import { t } from '@/i18n'

const props = withDefaults(defineProps<{
  nodeKey: string
  script: string
  conv: (s: string) => string
  coll?: string
  /** paragraph index to show first and mark (e.g. #p123) */
  target?: number
  /** paragraph index to show first without marking it (restored reading position) */
  start?: number
  highlight?: string[]
  linked?: Set<number>
  contained?: boolean
  idPrefix?: string
}>(), { coll: 'mula', idPrefix: '', target: undefined, start: undefined, highlight: () => [], linked: undefined })
const emit = defineEmits<{
  visible: [para: number, key: string]
  word: [roman: string, shown: string]
  /** the options menu of a paragraph (anchor: the element to show it next to) */
  menu: [para: Para, anchor: HTMLElement]
  loaded: [from: number, to: number, book: Book]
}>()

const api = useApi()
const settings = useSettings()
const root = ref<HTMLElement>()
const bottomSentinel = ref<HTMLElement>()
const paras = ref<Para[]>([])
const book = ref<Book | null>(null)
const from = ref(0), to = ref(0)
const loadingPrev = ref(false), loadingNext = ref(false)
const note = ref<{ el: HTMLElement; html: string } | null>(null)
const CHUNK = 150

const hl = computed(() => wordsRegex(props.highlight ?? []))
const opts = computed(() => ({ notes: settings.notes, pageRefs: settings.pageRefs, paraNums: settings.paraNums, highlight: hl.value }))
// rendered html cache: re-rendered when the script or options change
let htmlCache = new Map<number, string>()
watch([() => props.script, opts], () => { htmlCache = new Map() })
function render(p: Para) {
  // read the reactive inputs on every call so cache hits still re-render on script/option changes
  const o = opts.value
  void props.script
  let h = htmlCache.get(p.i)
  if (h === undefined) {
    h = paraHtml(p, props.conv, o)
    htmlCache.set(p.i, h)
  }
  return h
}

let gen = 0 // ignore responses of an older load
async function init() {
  const my = ++gen
  paras.value = []
  htmlCache = new Map()
  const first = props.target ?? props.start
  let c = await api.text(props.nodeKey)
  if (first !== undefined && (first < c.from || first >= c.to)) {
    c = await api.text(props.nodeKey, Math.max(0, first - 20), CHUNK)
  }
  if (my !== gen) return
  book.value = c.book
  from.value = c.from
  to.value = c.to
  paras.value = c.paras
  emit('loaded', c.from, c.to, c.book)
  await nextTick()
  scrollToPara(first ?? c.from, first === undefined)
}

async function loadNext() {
  if (loadingNext.value || !book.value || to.value >= book.value.paraCount) return
  loadingNext.value = true
  const my = gen
  try {
    const c = await api.text(props.nodeKey, to.value, CHUNK)
    if (my !== gen || c.from !== to.value) return
    paras.value = paras.value.concat(c.paras)
    to.value = c.to
    emit('loaded', c.from, c.to, c.book)
  } finally { loadingNext.value = false }
}

async function loadPrev() {
  if (loadingPrev.value || !book.value || from.value <= 0) return
  loadingPrev.value = true
  const my = gen
  try {
    const start = Math.max(0, from.value - CHUNK)
    const c = await api.text(props.nodeKey, start, from.value - start)
    if (my !== gen) return
    // keep the reading position: measure the height added above
    const el = scrollEl()
    const before = scrollHeight()
    paras.value = c.paras.concat(paras.value)
    from.value = c.from
    emit('loaded', c.from, c.to, c.book)
    await nextTick()
    const delta = scrollHeight() - before
    if (el === window) window.scrollBy(0, delta)
    else (el as HTMLElement).scrollTop += delta
  } finally { loadingPrev.value = false }
}

const scrollEl = (): HTMLElement | Window => (props.contained && root.value ? root.value : window)
const scrollHeight = () => (props.contained && root.value ? root.value.scrollHeight : document.documentElement.scrollHeight)

/** scroll a paragraph to the top of the view, loading it first when needed */
async function scrollToPara(i: number, top = false) {
  if (!book.value) return
  if (i < from.value || i >= to.value) {
    const my = ++gen
    const c = await api.text(props.nodeKey, Math.max(0, i - 20), CHUNK)
    if (my !== gen) return
    paras.value = c.paras
    from.value = c.from
    to.value = c.to
    emit('loaded', c.from, c.to, c.book)
    await nextTick()
  }
  const el = document.getElementById(`${props.idPrefix}p${i}`)
  if (!el) return
  if (top && i === from.value && !props.contained) { window.scrollTo(0, 0); return }
  if (props.contained && root.value) root.value.scrollTop += el.getBoundingClientRect().top - root.value.getBoundingClientRect().top - 12
  else window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 110)
}

// lazy loading near the ends
let io: IntersectionObserver | null = null
onMounted(() => {
  io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      if (e.target === bottomSentinel.value) loadNext()
    }
  }, { root: props.contained ? root.value : null, rootMargin: '1200px 0px' })
  if (bottomSentinel.value) io.observe(bottomSentinel.value)
  if (!props.contained) window.addEventListener('scroll', onScroll, { passive: true })
  init()
})
onBeforeUnmount(() => {
  io?.disconnect()
  window.removeEventListener('scroll', onScroll)
})
watch(() => props.nodeKey, init)

// the paragraph at the top of the view
let scrollTimer: ReturnType<typeof setTimeout> | undefined
function onScroll() {
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    const host = props.contained ? root.value! : document.documentElement
    const r = props.contained ? root.value!.getBoundingClientRect() : { top: 0, left: 0, width: window.innerWidth }
    const x = r.left + Math.min(r.width / 2, 300), y = r.top + (props.contained ? 20 : 130)
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('.para') as HTMLElement | null
    if (el && host.contains(el)) emit('visible', +el.dataset.i!, el.dataset.k!)
  }, 150)
}

// paragraph options (the menu itself is in ReaderPane); the button of the open menu stays visible
const menuFor = ref<number | null>(null)
function openMenu(i: number, anchor: HTMLElement) {
  const p = paras.value.find(x => x.i === i)
  if (!p) return
  menuFor.value = i
  emit('menu', p, anchor)
}
defineExpose({ scrollToPara, menuClosed: () => { menuFor.value = null } })

// the last tapped paragraph shows its options button (touch screens have no hover)
const tapped = ref<number | null>(null)
let selected: HTMLElement | null = null
function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const ptr = target.closest('.note-ptr') as HTMLElement | null
  const paraEl = target.closest('.para') as HTMLElement | null
  tapped.value = paraEl ? +paraEl.dataset.i! : null
  if (ptr && paraEl) {
    const p = paras.value.find(x => x.i === +paraEl.dataset.i!)
    const text = p ? noteTexts(p.t)[+ptr.dataset.i!] : ''
    note.value = text ? { el: ptr, html: markupToHtml(text, { convert: props.conv, notes: 'inline' }) } : null
    return
  }
  if (!settings.tapLookup || !paraEl) return
  if (window.getSelection()?.toString()) return // the user is selecting text
  const w = wordAtPoint(e.clientX, e.clientY)
  if (!w) return
  if (selected?.parentNode) selected.replaceWith(...Array.from(selected.childNodes))
  try {
    selected = document.createElement('span')
    selected.className = 'w-sel'
    w.range.surroundContents(selected)
  } catch { selected = null }
  emit('word', w.word, w.word)
}
</script>
