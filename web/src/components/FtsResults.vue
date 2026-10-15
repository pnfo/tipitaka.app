<!--
  Full text search results in the v2 layout: the matched word forms (combinations for several terms) with their
  frequency and number of texts; for the selected form the texts (suttas / chapters) with the number of hits,
  each expandable to its hits in context. Options and the selected form are in the url query.
-->
<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center gap-1.5 text-sm" data-testid="fts-options">
      <button v-for="o in toggles" :key="o.key" class="chip" :class="{ on: opt(o.key) }" :title="o.title" :data-testid="`opt-${o.key}`" @click="setOpt(o.key, !opt(o.key))">{{ o.label }}</button>
      <label v-if="terms.length > 1 && !opt('phrase')" class="flex items-center gap-1 text-xs text-muted">{{ t('Within') }}
        <select :value="distance" class="rounded border border-line bg-surface px-1" data-testid="opt-distance" @change="setOpt('distance', ($event.target as HTMLSelectElement).value)">
          <option v-for="d in [1, 2, 3, 5, 10, 20, 50]" :key="d" :value="d">{{ d }}</option>
        </select> {{ t('words') }}
      </label>
      <span class="mx-1 h-4 w-px bg-line" />
      <button v-for="f in FILTERS" :key="f.key" class="chip" :class="[`coll-${f.coll}`, { on: filter.includes(f.key) }]" :data-testid="`filter-${f.key}`" @click="toggleFilter(f.key)">
        <span class="coll-dot" />{{ f.label }}
      </button>
    </div>
    <details class="mb-3 text-xs text-muted">
      <summary class="cursor-pointer">{{ t('How to search') }}</summary>
      <ul class="mt-1 list-disc space-y-0.5 pl-5">
        <li>{{ t('A word finds all its endings: dhamma → dhammo, dhammassa, dhammānaṃ… (turn on "Exact word" to match only the word).') }}</li>
        <li>{{ t('* stands for any letters anywhere: *ssa finds words ending in ssa, *dhamm* words containing dhamm. ? is one letter.') }}</li>
        <li>{{ t('Without diacritics a word matches with or without them: dhamma also finds dhammā.') }}</li>
        <li>{{ t('Several words: found within the word distance, in any order; "In order" or "Phrase" make it stricter.') }}</li>
        <li>{{ t('Type in any script.') }}</li>
      </ul>
    </details>

    <div v-if="error" class="card text-center text-muted" data-testid="fts-error">{{ error }}</div>
    <div v-else-if="loading && !res" class="space-y-2"><div v-for="i in 5" :key="i" class="h-12 animate-pulse rounded-xl bg-surface2" /></div>
    <p v-else-if="res && !res.combos.length" class="py-6 text-center text-muted" data-testid="fts-empty">{{ t('No results') }}</p>
    <template v-else-if="res">
      <div class="mb-2 text-sm text-muted" data-testid="fts-summary">
        {{ t('{0} word forms', res.combos.length) }} · {{ t('{0} matches in {1} texts', res.total, res.groups.length) }}
        <span v-if="res.truncated" class="text-error"> · {{ t('the query is broad, results are limited') }}</span>
      </div>
      <div class="md:flex md:items-start md:gap-4">
        <!-- word forms -->
        <div class="mb-3 md:sticky md:top-[7.5rem] md:mb-0 md:max-h-[calc(100vh-9rem)] md:w-72 md:shrink-0 md:overflow-y-auto" data-testid="fts-combos">
          <div class="flex gap-1.5 overflow-x-auto pb-1 md:block md:space-y-0.5 md:overflow-visible md:pb-0">
            <button v-if="res.combos.length > 1" class="combo" :class="{ on: combo < 0 }" data-testid="combo-all" @click="setOpt('combo', 'all')">
              <span class="flex-1 text-left">{{ t('All forms') }}</span><span class="tabular-nums text-muted">{{ allFreq }}</span>
            </button>
            <button v-for="c in res.combos" :key="c.id" class="combo pali" :class="{ on: combo === c.id }" data-testid="combo" @click="setOpt('combo', String(c.id))">
              <span class="flex-1 truncate text-left">{{ c.words.map(conv).join(' … ') }}</span>
              <span class="tabular-nums text-muted" :title="t('occurrences')">{{ c.freq }}</span>
              <span class="hidden w-10 text-right text-xs tabular-nums text-muted md:inline" :title="t('texts')">{{ c.books }}</span>
            </button>
          </div>
        </div>

        <!-- texts with hits -->
        <div class="min-w-0 flex-1">
          <div class="mb-2 flex items-center gap-2 text-xs text-muted">
            <span class="flex-1">{{ t('Texts') }}</span>
            <button class="chip" :class="{ on: opt('sortFreq') }" data-testid="opt-sortFreq" @click="setOpt('sortFreq', !opt('sortFreq'))">{{ t('Sort by number of hits') }}</button>
          </div>
          <ul class="divide-y divide-line rounded-xl border border-line bg-surface" data-testid="fts-groups">
            <li v-for="g in res.groups.slice(0, groupLimit)" :key="g.key" :class="`coll-${g.coll}`" data-testid="fts-group">
              <div class="flex items-center gap-2 px-3 py-2">
                <button class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:text-fg" :aria-expanded="!!open[g.key]" :aria-label="t('Show the hits')"
                  data-testid="group-expand" @click="toggle(g)">
                  <IconChevron class="h-4 w-4 transition-transform" :class="{ 'rotate-90': open[g.key] }" />
                </button>
                <span class="coll-dot" />
                <RouterLink :to="readLink(g.key, g.para)" class="min-w-0 flex-1 hover:text-primary">
                  <span class="pali block truncate font-medium">{{ conv(g.title) }}</span>
                  <span class="pali block truncate text-xs text-muted">{{ conv(g.path) }}</span>
                </RouterLink>
                <span class="chip tabular-nums">{{ g.count }}</span>
              </div>
              <div v-if="open[g.key]" class="border-t border-line bg-bg px-3 py-2" data-testid="group-hits">
                <RouterLink v-for="(h, i) in open[g.key].hits" :key="i" :to="readLink(h.key, h.para, h)" class="block rounded-lg px-2 py-1.5 hover:bg-surface2">
                  <div class="reading pali" style="font-size: 0.98rem; line-height: 1.5" v-html="snippet(h)" />
                </RouterLink>
                <button v-if="open[g.key].hits.length < g.count" class="mt-1 text-xs text-link underline" @click="moreHits(g)">{{ t('More') }}</button>
              </div>
            </li>
          </ul>
          <div v-if="res.groups.length > groupLimit" class="mt-3 text-center">
            <button class="btn" data-testid="groups-more" @click="groupLimit += 200">{{ t('Show more texts') }} ({{ res.groups.length - groupLimit }})</button>
          </div>
          <p v-if="res.groupsTruncated" class="mt-2 text-xs text-muted">{{ t('Only the first {0} texts are listed. Use the filters to narrow the search.', res.groups.length) }}</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IconChevron from '~icons/lucide/chevron-right'
import { ApiError, useApi } from '@/data/api'
import type { FtsGroup, FtsHit, FtsResult } from '@/data/types'
import { useScript } from '@/composables/script'
import { tokenize, indexedText } from '@shared/tokenize'
import { escapeHtml } from '@shared/markup'
import { t } from '@/i18n'

const props = defineProps<{ q: string }>()
const route = useRoute(), router = useRouter()
const api = useApi()
const { script, conv } = useScript()

const FILTERS = [
  { key: 'mula', coll: 'mula', label: 'Mūla' }, { key: 'atta', coll: 'atta', label: 'Aṭṭhakathā' }, { key: 'tika', coll: 'tika', label: 'Ṭīkā' },
  { key: 'anya', coll: 'anya', label: 'Añña' }, { key: 'vp', coll: 'mula', label: 'Vinaya' }, { key: 'sp', coll: 'mula', label: 'Sutta' }, { key: 'ap', coll: 'mula', label: 'Abhidhamma' },
]
const toggles = computed(() => [
  { key: 'exact', label: t('Exact word'), title: t('Do not match longer words') },
  { key: 'phrase', label: t('Phrase'), title: t('Words next to each other in this order') },
  { key: 'order', label: t('In order'), title: t('Words in this order') },
])

const opt = (k: string) => route.query[k] === '1'
const distance = computed(() => +(route.query.distance ?? 10) || 10)
const filter = computed(() => String(route.query.filter ?? '').split(',').filter(Boolean))
// v2 showed the first (most frequent) form; ?combo=all shows every form
const combo = computed(() => (route.query.combo === 'all' ? -1 : typeof route.query.combo === 'string' && route.query.combo !== '' ? +route.query.combo : 0))
const terms = computed(() => props.q.split(/\s+/).filter(Boolean))

function setOpt(k: string, v: boolean | string) {
  const query = { ...route.query }
  if (v === false || v === '') delete query[k]
  else query[k] = v === true ? '1' : v
  if (k !== 'combo' && k !== 'sortFreq') delete query.combo
  router.replace({ query })
}
function toggleFilter(k: string) {
  const f = new Set(filter.value)
  if (f.has(k)) f.delete(k)
  else f.add(k)
  setOpt('filter', [...f].join(','))
}

const res = ref<FtsResult | null>(null)
const error = ref('')
const loading = ref(false)
const groupLimit = ref(200)
const open = reactive<Record<string, { hits: FtsHit[]; page: number }>>({})
const params = computed(() => ({ q: props.q, exact: opt('exact'), phrase: opt('phrase'), order: opt('order'), distance: distance.value, filter: filter.value,
  combo: combo.value, sortFreq: opt('sortFreq') }))

let gen = 0
watch(params, async p => {
  for (const k of Object.keys(open)) delete open[k]
  groupLimit.value = 200
  if (!p.q) { res.value = null; return }
  const my = ++gen
  loading.value = true
  error.value = ''
  try {
    const r = await api.fts({ ...p, pageSize: 0 })
    if (my !== gen) return
    res.value = r
    if (r.groups.length === 1) toggle(r.groups[0])
  } catch (e) {
    if (my !== gen) return
    res.value = null
    error.value = e instanceof ApiError && e.code === 'too_broad' ? t('The search is too broad. Please use longer words.')
      : e instanceof ApiError && e.code === 'bad_request' ? t('Please enter a word to search.') : t('Search failed.')
  } finally { if (my === gen) loading.value = false }
}, { immediate: true, deep: true })

const allFreq = computed(() => res.value?.combos.reduce((s, c) => s + c.freq, 0) ?? 0)

async function loadHits(g: FtsGroup, page: number) {
  const r = await api.fts({ ...params.value, group: g.key, page, pageSize: 20 })
  return r.hits
}
async function toggle(g: FtsGroup) {
  if (open[g.key]) { delete open[g.key]; return }
  open[g.key] = { hits: [], page: 0 }
  open[g.key].hits = await loadHits(g, 0)
}
async function moreHits(g: FtsGroup) {
  const o = open[g.key]
  o.page++
  o.hits = o.hits.concat(await loadHits(g, o.page))
}

/** words to highlight in the reader: the hit's words, or the selected form's */
function hlOf(h?: FtsHit): string {
  if (h) {
    const toks = tokenize(h.text)
    return h.offs.map(o => toks[o]?.w).filter(Boolean).join(' ')
  }
  const cs = combo.value < 0 ? res.value?.combos.slice(0, 20) ?? [] : res.value?.combos.filter(c => c.id === combo.value) ?? []
  return [...new Set(cs.flatMap(c => c.words))].join(' ')
}
const readLink = (key: string, para: number, h?: FtsHit) => ({ name: 'read', params: { script: script.value, key }, hash: `#p${para}`, query: { hl: hlOf(h) } })

/** a window of the paragraph around the hit, matched tokens highlighted */
function snippet(h: FtsHit): string {
  const flat = indexedText(h.text)
  const toks = tokenize(h.text)
  if (!toks.length) return escapeHtml(conv(flat.slice(0, 200)))
  const set = new Set(h.offs)
  const first = Math.min(...h.offs), last = Math.max(...h.offs)
  const startTok = Math.max(0, first - 12), endTok = Math.min(toks.length - 1, last + 12)
  let out = startTok > 0 ? '… ' : ''
  let pos = toks[startTok].start
  for (let i = startTok; i <= endTok; i++) {
    const tk = toks[i]
    out += escapeHtml(conv(flat.slice(pos, tk.start)))
    const w = escapeHtml(conv(flat.slice(tk.start, tk.end)))
    out += set.has(i) ? `<mark>${w}</mark>` : w
    pos = tk.end
  }
  out += escapeHtml(conv(flat.slice(pos, endTok + 1 < toks.length ? toks[endTok + 1].start : flat.length)))
  return out + (endTok < toks.length - 1 ? ' …' : '')
}
</script>

<style scoped>
.combo { display: flex; align-items: center; gap: .5rem; flex-shrink: 0; border-radius: .5rem; border: 1px solid var(--c-line); background: var(--c-surface); padding: .3rem .6rem; font-size: .9rem; }
@media (min-width: 900px) { .combo { width: 100%; border-color: transparent; background: transparent; } }
.combo:hover { background: var(--c-surface2); }
.combo.on { border-color: var(--c-primary); background: var(--c-primary-soft); color: var(--c-primary); }
</style>
