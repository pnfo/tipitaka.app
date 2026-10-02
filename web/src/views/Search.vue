<!-- /:script/search/:q (text), /:script/titles/:q, /:script/dict/:q - options are in the query string -->
<template>
  <div class="mx-auto max-w-4xl px-4 pb-20 pt-4">
    <form class="mb-3 flex gap-2" @submit.prevent="submit">
      <input v-model="input" class="input pali text-base" :placeholder="t('Search')" type="search" autocapitalize="off" spellcheck="false" data-testid="search-page-input">
      <button class="btn-primary" type="submit"><IconSearch class="h-4 w-4" /></button>
    </form>
    <div class="mb-4 flex gap-1 border-b border-line" role="tablist">
      <RouterLink v-for="m in modes" :key="m.name" :to="{ name: m.name, params: { script, q: q || undefined }, query: m.name === 'search' ? route.query : {} }" role="tab"
        class="-mb-px border-b-2 px-3 py-2 text-sm" :class="route.name === m.name ? 'border-primary font-medium text-primary' : 'border-transparent text-muted hover:text-fg'"
        :data-testid="`mode-${m.name}`">{{ m.label }}</RouterLink>
    </div>

    <!-- full text search -->
    <template v-if="route.name === 'search'">
      <div class="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <button v-for="o in toggles" :key="o.key" class="chip" :class="{ on: opt(o.key) }" :title="o.title" :data-testid="`opt-${o.key}`" @click="setOpt(o.key, !opt(o.key))">{{ o.label }}</button>
        <label v-if="terms.length > 1 && !opt('phrase')" class="flex items-center gap-1 text-xs text-muted">{{ t('Within') }}
          <select :value="distance" class="rounded border border-line bg-surface px-1" @change="setOpt('distance', ($event.target as HTMLSelectElement).value)">
            <option v-for="d in [2, 3, 5, 10, 20, 50]" :key="d" :value="d">{{ d }}</option>
          </select> {{ t('words') }}
        </label>
        <span class="mx-1 h-4 w-px bg-line" />
        <button v-for="f in FILTERS" :key="f.key" class="chip" :class="[`coll-${f.coll}`, { on: filter.includes(f.key) }]" :data-testid="`filter-${f.key}`" @click="toggleFilter(f.key)">
          <span class="coll-dot" />{{ f.label }}
        </button>
      </div>
      <p class="mb-3 text-xs text-muted">{{ t('Words match as prefixes (dhamma → dhammo, dhammassa…). Use * for any letters (*ssa, *na*). Without diacritics, dhamma also finds dhammā.') }}</p>
      <div v-if="ftsError" class="card text-center text-muted" data-testid="fts-error">{{ ftsError }}</div>
      <template v-else-if="fts">
        <div class="mb-3 text-sm text-muted" data-testid="fts-summary">
          {{ t('{0} matches', fts.total) }}<span v-if="fts.truncated"> · {{ t('the query is broad, results are limited') }}</span>
        </div>
        <div v-if="fts.combos.length > 1" class="mb-4 flex flex-wrap gap-1.5" data-testid="fts-combos">
          <button class="chip" :class="{ on: combo < 0 }" @click="setOpt('combo', '')">{{ t('All') }}</button>
          <button v-for="c in fts.combos.slice(0, comboLimit)" :key="c.id" class="chip pali" :class="{ on: combo === c.id }" @click="setOpt('combo', String(c.id))">
            {{ c.words.map(conv).join(' … ') }} <span class="text-muted">{{ c.freq }}</span>
          </button>
          <button v-if="fts.combos.length > comboLimit" class="chip" @click="comboLimit += 50">+{{ fts.combos.length - comboLimit }}</button>
        </div>
        <ol class="space-y-2" data-testid="fts-hits">
          <li v-for="(h, i) in hits" :key="i">
            <RouterLink :to="{ name: 'read', params: { script, key: h.key }, hash: `#p${h.para}`, query: { hl: hlWords(h) } }" class="card block hover:border-primary">
              <div class="pali mb-1 truncate text-xs text-muted">{{ conv(h.path) }} › {{ conv(h.title) }}</div>
              <div class="reading pali" style="font-size: 1rem; line-height: 1.5" v-html="snippet(h)" />
            </RouterLink>
          </li>
        </ol>
        <div v-if="hits.length < fts.total" class="mt-4 text-center">
          <button class="btn" :disabled="loadingMore" data-testid="fts-more" @click="more">{{ t('Load more') }}</button>
        </div>
      </template>
      <div v-else-if="loading" class="space-y-2"><div v-for="i in 5" :key="i" class="h-16 animate-pulse rounded-xl bg-surface2" /></div>
    </template>

    <!-- titles -->
    <template v-else-if="route.name === 'titles'">
      <ul v-if="titleHits.length" class="divide-y divide-line" data-testid="title-hits">
        <li v-for="h in titleHits" :key="h.key">
          <RouterLink :to="{ name: 'read', params: { script, key: h.key } }" class="flex items-center gap-3 px-2 py-2 hover:bg-surface2" :class="`coll-${h.coll}`">
            <span class="coll-dot" />
            <span class="pali min-w-0 flex-1"><span class="font-medium">{{ conv(h.title) }}</span>
              <span class="block truncate text-xs text-muted">{{ conv(h.bookTitle) }} › {{ conv(h.parent) }}</span></span>
          </RouterLink>
        </li>
      </ul>
      <p v-else-if="q && !loading" class="text-center text-muted">{{ t('No results') }}</p>
    </template>

    <!-- dictionary -->
    <DictView v-else-if="route.name === 'dict'" :word="q" mode="dict" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import IconSearch from '~icons/lucide/search'
import DictView from '@/components/DictView.vue'
import { ApiError, useApi } from '@/data/api'
import type { FtsHit, FtsResult, TitleHit } from '@/data/types'
import { toRoman, useScript } from '@/composables/script'
import { tokenize, indexedText } from '@shared/tokenize'
import { escapeHtml } from '@shared/markup'
import { t } from '@/i18n'

const route = useRoute(), router = useRouter()
const api = useApi()
const { script, conv } = useScript()

const q = computed(() => (route.params.q as string | undefined) ?? '')
const input = ref(q.value ? conv(q.value) : '')
watch(q, v => { input.value = v ? conv(v) : '' })
watch(script, () => { input.value = q.value ? conv(q.value) : '' })
useHead({ title: computed(() => (q.value ? `${conv(q.value)} – ${t('Search')}` : t('Search'))) })

const modes = computed(() => [{ name: 'search', label: t('Text') }, { name: 'titles', label: t('Titles') }, { name: 'dict', label: t('Dictionary') }] as const)
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
const combo = computed(() => (typeof route.query.combo === 'string' && route.query.combo !== '' ? +route.query.combo : -1))
const terms = computed(() => q.value.split(/\s+/).filter(Boolean))

function setOpt(k: string, v: boolean | string) {
  const query = { ...route.query }
  if (v === false || v === '') delete query[k]
  else query[k] = v === true ? '1' : v
  if (k !== 'combo') delete query.combo
  router.replace({ query })
}
function toggleFilter(k: string) {
  const f = new Set(filter.value)
  if (f.has(k)) f.delete(k)
  else f.add(k)
  setOpt('filter', [...f].join(','))
}
function submit() {
  const r = toRoman(input.value.trim())
  router.push({ name: route.name as string, params: { script: script.value, q: r || undefined }, query: route.name === 'search' ? { ...route.query, combo: undefined } : {} })
}

// ---------------- full text ----------------
const fts = ref<FtsResult | null>(null)
const hits = ref<FtsHit[]>([])
const ftsError = ref('')
const loading = ref(false), loadingMore = ref(false)
const comboLimit = ref(30)
let page = 0
const params = computed(() => ({ q: q.value, exact: opt('exact'), phrase: opt('phrase'), order: opt('order'), distance: distance.value, filter: filter.value, combo: combo.value }))

watch([() => route.name, params], async () => {
  if (route.name !== 'search' || !q.value) { fts.value = null; hits.value = []; return }
  loading.value = true
  ftsError.value = ''
  page = 0
  try {
    const r = await api.fts({ ...params.value, page: 0 })
    fts.value = r
    hits.value = r.hits
  } catch (e) {
    fts.value = null
    ftsError.value = e instanceof ApiError && e.code === 'too_broad' ? t('The search is too broad. Please use longer words.') : e instanceof ApiError && e.code === 'bad_request' ? t('Please enter a word to search.') : t('Search failed.')
  } finally { loading.value = false }
}, { immediate: true, deep: true })

async function more() {
  loadingMore.value = true
  try {
    const r = await api.fts({ ...params.value, page: ++page })
    hits.value = hits.value.concat(r.hits)
  } finally { loadingMore.value = false }
}

/** words of the hit (to highlight in the reader) */
function hlWords(h: FtsHit): string {
  const toks = tokenize(h.text)
  return h.offs.map(o => toks[o]?.w).filter(Boolean).join(' ')
}

/** a window of the paragraph around the hit, matched tokens highlighted */
function snippet(h: FtsHit): string {
  const flat = indexedText(h.text)
  const toks = tokenize(h.text)
  const set = new Set(h.offs)
  const first = Math.min(...h.offs), last = Math.max(...h.offs)
  const startTok = Math.max(0, first - 14), endTok = Math.min(toks.length - 1, last + 14)
  if (!toks.length) return escapeHtml(conv(flat.slice(0, 200)))
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

// ---------------- titles ----------------
const titleHits = ref<TitleHit[]>([])
watch([() => route.name, q], async () => {
  if (route.name !== 'titles' || !q.value) { titleHits.value = []; return }
  loading.value = true
  try { titleHits.value = await api.titles(q.value, undefined, 200) } finally { loading.value = false }
}, { immediate: true })
</script>
