<!--
  A book as a continuous stream: starts at a node (or a target paragraph) and loads more paragraphs when
  scrolling down (and on request above). Scrolls the window, or its own container when `contained` (parallel view).
  Emits the paragraph at the top of the view (url / breadcrumb sync, parallel sync).
-->
<template>
  <div ref="root" :class="contained ? 'h-full overflow-y-auto overscroll-contain' : ''" @scroll.passive="onScroll(); $emit('scrolled')">
    <div class="reading relative mx-auto max-w-reading" :class="[`coll-${coll}`, contained ? 'px-3 sm:px-4' : 'px-4 sm:px-6']" @click="onClick">
      <div v-if="from > 0" class="flex justify-center pt-2 font-ui">
        <button class="btn py-1 text-xs text-muted" :disabled="loadingPrev" data-testid="load-prev" @click="loadPrev"><IconUp class="h-4 w-4" />{{ t('Show previous text') }}</button>
      </div>
      <!-- every paragraph / verse / heading has an options button (tipitaka.lk): shown on hover, on touch screens after a tap -->
      <div v-for="(p, n) in paras" :key="p.i" class="para-wrap" :class="{ 'menu-open': menuFor === p.i, tapped: tapped === p.i, 'first-para': n === 0 }">
        <div :id="`${idPrefix}p${p.i}`" :data-i="p.i" :data-k="p.k" :class="[paraClass(p), { target: p.i === target }]" v-html="render(p)" />
        <button class="para-dots" :aria-label="t('Options')" data-testid="para-options" @click.stop="openMenu(p.i, $event.currentTarget as HTMLElement)">
          <IconDots class="h-5 w-5" />
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
import type { Span } from '@shared/markup'
import { useSettings } from '@/stores/settings'
import { paraClass, paraHtml, wordAtPoint, wordsRegex } from '@/composables/text'
import { glossIdsAt } from '@/composables/glosses'
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
  /** commentary alignment underlines per paragraph */
  glosses?: Map<number, Span[]>
  contained?: boolean
  idPrefix?: string
}>(), { coll: 'mula', idPrefix: '', target: undefined, start: undefined, highlight: () => [], glosses: undefined })
const emit = defineEmits<{
  visible: [para: number, key: string]
  /** a tapped word, with the glosses (ids) of the underline it is in and its paragraph */
  word: [roman: string, shown: string, glosses: number[], para: { key: string; para: number }]
  scrolled: []
  /** the options menu of a paragraph (anchor: the element to show it next to) */
  menu: [para: Para | null, anchor: HTMLElement | null] // null: close it
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
// rendered html cache: re-rendered when the script or options change, or the paragraph's underlines arrive
let htmlCache = new Map<number, { h: string; sp?: Span[] }>()
watch([() => props.script, opts], () => { htmlCache = new Map() })
function render(p: Para) {
  // read the reactive inputs on every call so cache hits still re-render on script/option changes
  const o = opts.value
  void props.script
  const sp = settings.glosses ? props.glosses?.get(p.i) : undefined
  let c = htmlCache.get(p.i)
  if (c === undefined || c.sp !== sp) {
    c = { h: paraHtml(p, props.conv, o, sp), sp }
    htmlCache.set(p.i, c)
  }
  return c.h
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
  await scrollToPara(first ?? c.from)
  fillView()
}

// the observer only reports changes: a first chunk shorter than the view (a small node) keeps the end in view
function fillView() {
  const s = bottomSentinel.value
  if (!s) return
  const bottom = props.contained && root.value ? root.value.getBoundingClientRect().bottom : window.innerHeight
  if (s.getBoundingClientRect().top < bottom + 1200) loadNext()
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
  await nextTick()
  fillView()
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
async function scrollToPara(i: number) {
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
    setTimeout(fillView)
  }
  const el = document.getElementById(`${props.idPrefix}p${i}`)
  if (!el) return
  if (i === from.value && !props.contained) { window.scrollTo(0, 0); return } // the start: the very top, not 110px into it
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
    // the first paragraph that reaches below the bars: also at the very top, where the line crosses a button or a gap
    const y = props.contained ? root.value!.getBoundingClientRect().top + 20 : 130
    const el = [...host.querySelectorAll<HTMLElement>('.para[data-i]')].find(e => e.getBoundingClientRect().bottom > y)
    if (el) emit('visible', +el.dataset.i!, el.dataset.k!)
  }, 150)
}

// paragraph options (the menu itself is in ReaderPane); the button of the open menu stays visible
const menuFor = ref<number | null>(null)
/** the options of a paragraph; again (its button, number or margin) closes them */
function openMenu(i: number, anchor: HTMLElement) {
  const p = paras.value.find(x => x.i === i)
  if (!p) return
  if (menuFor.value === i) { menuFor.value = null; emit('menu', null, null); return }
  menuFor.value = i
  emit('menu', p, anchor)
}
defineExpose({ scrollToPara, menuClosed: () => { menuFor.value = null }, scrollRoot: () => root.value ?? null })

// the last tapped paragraph shows its options button (touch screens have no hover)
const tapped = ref<number | null>(null)
let selected: HTMLElement | null = null
/** the paragraph whose first line starts to the right of the point (a tap on its number, in its indent or in the margin before it) */
function gutterPara(x: number, y: number, target: HTMLElement, paraEl: HTMLElement | null): HTMLElement | null {
  if (paraEl && target.closest('.num')) return paraEl
  const candidates = paraEl ? [paraEl] : [...(root.value?.querySelectorAll<HTMLElement>('.para[data-i]') ?? [])]
  for (const p of candidates) {
    const r = p.getBoundingClientRect()
    if (y < r.top || y > r.bottom) continue
    const first = firstTextRect(p)
    return first && y <= first.bottom + 4 && x < first.left ? p : null
  }
  return null
}

/** the box of the first letter of a paragraph's text (after its number) */
function firstTextRect(p: HTMLElement): DOMRect | null {
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement?.closest('.num') || !/\S/.test(n.textContent ?? '') ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT),
  })
  const n = walker.nextNode()
  if (!n) return null
  const i = (n.textContent ?? '').search(/\S/)
  const range = document.createRange()
  range.setStart(n, i)
  range.setEnd(n, i + 1)
  return range.getClientRects()[0] ?? null
}

function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const ptr = target.closest('.note-ptr') as HTMLElement | null
  const paraEl = target.closest('.para') as HTMLElement | null
  tapped.value = paraEl ? +paraEl.dataset.i! : null
  // the start of a paragraph's first line (its number, the indent, the margin before it) opens its options
  const gutter = !ptr && gutterPara(e.clientX, e.clientY, target, paraEl)
  if (gutter) {
    tapped.value = +gutter.dataset.i!
    const dots = gutter.parentElement?.querySelector<HTMLElement>('.para-dots')
    if (dots) openMenu(+gutter.dataset.i!, dots)
    return
  }
  if (ptr && paraEl) {
    const p = paras.value.find(x => x.i === +paraEl.dataset.i!)
    const text = p ? noteTexts(p.t)[+ptr.dataset.i!] : ''
    note.value = text ? { el: ptr, html: markupToHtml(text, { convert: props.conv, notes: 'inline' }) } : null
    return
  }
  if (!settings.tapLookup || !paraEl) return
  if (window.getSelection()?.toString()) return // the user is selecting text
  const glosses = glossIdsAt(target)
  const w = wordAtPoint(e.clientX, e.clientY)
  if (!w) {
    // between the words of an underlined phrase: its commentary only
    if (glosses.length) emit('word', '', '', glosses, { key: paraEl.dataset.k!, para: +paraEl.dataset.i! })
    return
  }
  if (selected?.parentNode) selected.replaceWith(...Array.from(selected.childNodes))
  try {
    selected = document.createElement('span')
    selected.className = 'w-sel'
    w.range.surroundContents(selected)
  } catch { selected = null }
  emit('word', w.word, w.word, glosses, { key: paraEl.dataset.k!, para: +paraEl.dataset.i! })
}
</script>
