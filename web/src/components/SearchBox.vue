<!--
  One search box for everything: typing (in any script) suggests matching titles and offers text search,
  title search and a dictionary lookup; Enter runs a text search.
-->
<template>
  <div class="relative" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.esc="close">
    <label class="flex h-10 items-center gap-2 rounded-full border border-line bg-surface2 px-3 focus-within:border-primary focus-within:bg-surface">
      <IconSearch class="h-4 w-4 shrink-0 text-muted" />
      <input ref="input" v-model="q" type="search" class="h-full w-full min-w-0 bg-transparent text-sm outline-none" :placeholder="t('Search text, titles, dictionary…')"
        :aria-label="t('Search')" autocomplete="off" autocapitalize="off" spellcheck="false" data-testid="search-input"
        @focus="focused = true" @blur="onBlur" @keydown.enter.prevent="choose(active)">
    </label>
    <div v-if="showMenu" class="absolute inset-x-0 top-11 z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-xl" role="listbox" data-testid="search-menu">
      <button v-for="(it, i) in items" :key="it.id" class="menu-item" :class="{ 'bg-surface2': i === active }" role="option"
        @mousedown.prevent="choose(i)" @mouseenter="active = i">
        <component :is="it.icon" class="h-4 w-4 shrink-0 text-muted" />
        <span v-if="it.coll" class="coll-dot" :class="`coll-${it.coll}`" />
        <span class="min-w-0 flex-1 truncate">
          <span :class="{ pali: it.pali }">{{ it.label }}</span>
          <span v-if="it.sub" class="ml-2 text-xs text-muted">{{ it.sub }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { watchDebounced } from '@vueuse/core'
import IconSearch from '~icons/lucide/search'
import IconText from '~icons/lucide/text-search'
import IconHeading from '~icons/lucide/heading'
import IconBook from '~icons/lucide/book-open'
import IconFile from '~icons/lucide/file-text'
import { useApi } from '@/data/api'
import type { TitleHit } from '@/data/types'
import { toRoman, useScript } from '@/composables/script'
import { t } from '@/i18n'

interface Item { id: string; icon: Component; label: string; sub?: string; pali?: boolean; coll?: string; go: () => void }

const router = useRouter()
const { script, conv } = useScript()
const api = useApi()
const q = ref('')
const focused = ref(false)
const active = ref(0)
const titles = ref<TitleHit[]>([])
const input = ref<HTMLInputElement>()

const roman = computed(() => toRoman(q.value.trim()))
watchDebounced(roman, async r => {
  if (r.length < 2) { titles.value = []; return }
  try { titles.value = await api.titles(r, undefined, 6) } catch { titles.value = [] }
}, { debounce: 200 })
watch(q, () => { active.value = 0 })

const items = computed<Item[]>(() => {
  const r = roman.value
  if (!r) return []
  const shown = conv(r)
  const out: Item[] = [
    { id: 'text', icon: IconText, label: t('Search text for "{0}"', shown), go: () => go('search', r) },
    { id: 'dict', icon: IconBook, label: t('Look up "{0}" in the dictionary', shown), go: () => go('dict', r) },
  ]
  for (const h of titles.value) {
    out.push({ id: h.key, icon: IconFile, label: conv(h.title), sub: conv(h.bookTitle), pali: true, coll: h.coll, go: () => router.push({ name: 'read', params: { script: script.value, key: h.key } }) })
  }
  if (titles.value.length) out.push({ id: 'titles', icon: IconHeading, label: t('All titles matching "{0}"', shown), go: () => go('titles', r) })
  return out
})
const showMenu = computed(() => focused.value && items.value.length > 0)

function go(name: 'search' | 'dict' | 'titles', r: string) {
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
