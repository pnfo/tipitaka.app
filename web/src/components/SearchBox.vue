<!--
  The search box (v2: one box with a search type). The type button switches between full text search in all
  the texts, title search and the dictionary; Enter searches with the selected type. While typing, matching
  titles are suggested. Input in any script is accepted; the font follows the typed script.
-->
<template>
  <div class="relative" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.esc="close">
    <div class="flex h-10 items-center rounded-full border border-line bg-surface2 focus-within:border-primary focus-within:bg-surface">
      <button type="button" class="ml-1 flex h-8 shrink-0 items-center rounded-full px-2 text-xs font-medium text-primary hover:bg-surface2" :title="t('Search type')"
        :aria-label="t('Search type') + ': ' + TYPES[type].label" data-testid="search-type" @click="cycleType">
        <component :is="TYPES[type].icon" class="h-4 w-4" />
        <span class="ml-1 hidden md:inline">{{ TYPES[type].short }}</span>
      </button>
      <input ref="input" v-model="q" type="search" class="h-full w-full min-w-0 bg-transparent pl-1 pr-3 text-sm outline-none" :data-script="inputScript"
        :style="inputScript !== 'latn' ? { fontFamily: 'var(--font-text)', fontSize: '0.9375rem' } : undefined" :placeholder="TYPES[type].placeholder"
        :aria-label="t('Search')" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" data-testid="search-input"
        @focus="focused = true" @blur="onBlur" @keydown.enter.prevent="choose(active)">
    </div>
    <div v-if="showMenu" class="absolute inset-x-0 top-11 z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-xl" role="listbox" data-testid="search-menu">
      <button v-for="(it, i) in items" :key="it.id" class="menu-item" :class="{ 'bg-surface2': i === active }" role="option"
        @mousedown.prevent="choose(i)" @mouseenter="active = i">
        <component :is="it.icon" class="h-4 w-4 shrink-0 text-muted" />
        <span v-if="it.coll" class="coll-dot" :class="`coll-${it.coll}`" />
        <span class="min-w-0 flex-1 truncate">
          <span>{{ it.label }}</span><b v-if="it.term" class="pali">{{ it.term }}</b>
          <span v-if="it.sub" class="ml-2 text-xs text-muted">{{ it.sub }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { watchDebounced } from '@vueuse/core'
import IconText from '~icons/lucide/text-search'
import IconHeading from '~icons/lucide/heading'
import IconBook from '~icons/lucide/book-a'
import IconFile from '~icons/lucide/file-text'
import { useApi } from '@/data/api'
import type { TitleHit } from '@/data/types'
import { detectScript, toRoman, useScript } from '@/composables/script'
import { readJson, writeJson } from '@/stores/storage'
import { useCollectionFilter } from '@/composables/filters'
import { t } from '@/i18n'

type SearchType = 'search' | 'titles' | 'dict'
interface Item { id: string; icon: Component; label: string; term?: string; sub?: string; coll?: string; go: () => void }

const TYPES = computed<Record<SearchType, { icon: Component; label: string; short: string; placeholder: string }>>(() => ({
  search: { icon: IconText, label: t('Full text search'), short: t('Text'), placeholder: t('Search all texts…') },
  titles: { icon: IconHeading, label: t('Title search'), short: t('Titles'), placeholder: t('Search titles…') },
  dict: { icon: IconBook, label: t('Dictionary'), short: t('Dictionary'), placeholder: t('Look up a word…') },
}))
const ORDER: SearchType[] = ['search', 'titles', 'dict']

const router = useRouter(), route = useRoute()
const { script, conv } = useScript()
const api = useApi()
const q = ref('')
const type = ref<SearchType>(readJson<SearchType>('tipitaka.app-search-type', 'search'))
watch(type, v => writeJson('tipitaka.app-search-type', v))
// on a search page the box follows its type
watch(() => route.name, n => { if (n === 'search' || n === 'titles' || n === 'dict') type.value = n }, { immediate: true })
const focused = ref(false)
const active = ref(0)
const titles = ref<TitleHit[]>([])
const input = ref<HTMLInputElement>()
const inputScript = computed(() => detectScript(q.value))
const { keys: collFilter } = useCollectionFilter()

const roman = computed(() => toRoman(q.value.trim()))
watchDebounced(roman, async r => {
  if (r.length < 2) { titles.value = []; return }
  try { titles.value = await api.titles(r, collFilter.value, 6) } catch { titles.value = [] }
}, { debounce: 200 })
watch(q, () => { active.value = 0 })

function cycleType() {
  type.value = ORDER[(ORDER.indexOf(type.value) + 1) % ORDER.length]
  input.value?.focus()
}

const items = computed<Item[]>(() => {
  const r = roman.value
  if (!r) return []
  const shown = conv(r)
  const LABEL: Record<SearchType, string> = { search: t('Search all texts for '), titles: t('Titles containing '), dict: t('Dictionary: ') }
  const mk = (tp: SearchType): Item => ({ id: tp, icon: TYPES.value[tp].icon, label: LABEL[tp], term: shown, go: () => go(tp, r) })
  // the selected type first (Enter), then the other two
  const out = [mk(type.value), ...ORDER.filter(tp => tp !== type.value).map(mk)]
  for (const h of titles.value) {
    out.push({ id: h.key, icon: IconFile, label: conv(h.title), sub: conv(h.bookTitle), coll: h.coll, go: () => router.push({ name: 'read', params: { script: script.value, key: h.key } }) })
  }
  return out
})
const showMenu = computed(() => focused.value && items.value.length > 0)

function go(name: SearchType, r: string) {
  type.value = name
  router.push({ name, params: { script: script.value, q: r } })
}
function choose(i: number) {
  const it = items.value[i]
  if (!it) return
  it.go()
  close()
}
function move(d: number) {
  if (!items.value.length) return
  active.value = (active.value + d + items.value.length) % items.value.length
}
function close() {
  focused.value = false
  input.value?.blur()
}
const onBlur = () => setTimeout(() => { focused.value = false }, 150)
</script>
