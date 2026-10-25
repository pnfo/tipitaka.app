<!-- /:script/search/:q (text), /:script/titles/:q, /:script/dict/:q - options are in the query string -->
<template>
  <div class="mx-auto max-w-4xl px-4 pb-20 pt-4">
    <form class="mb-3 flex items-center gap-2" @submit.prevent="submit">
      <input v-model="input" class="input text-base" :data-script="inputScript" :style="inputScript !== 'latn' ? { fontFamily: 'var(--font-text)' } : undefined"
        :placeholder="t('Search')" type="search" autocapitalize="off" spellcheck="false" enterkeyhint="search" data-testid="search-page-input">
      <button class="btn-primary h-10" type="submit" :aria-label="t('Search')"><IconSearch class="h-4 w-4" /></button>
      <DictFilter v-if="route.name === 'dict'" />
      <CollectionFilter v-else />
    </form>
    <div class="mb-4 flex gap-1 border-b border-line" role="tablist">
      <RouterLink v-for="m in modes" :key="m.name" :to="{ name: m.name, params: { script, q: q || undefined }, query: m.name === 'search' ? route.query : {} }" role="tab"
        class="-mb-px border-b-2 px-3 py-2 text-sm" :class="route.name === m.name ? 'border-primary font-medium text-primary' : 'border-transparent text-muted hover:text-fg'"
        :data-testid="`mode-${m.name}`">{{ m.label }}</RouterLink>
      <RouterLink :to="{ name: 'help', params: { script }, hash: '#search' }" class="icon-btn ml-auto self-center text-muted" :title="t('Help')" :aria-label="t('Help')">
        <IconHelp class="h-4 w-4" /></RouterLink>
    </div>

    <!-- nothing searched yet: what the search type does, with examples -->
    <div v-if="!q" class="mb-4 text-sm" data-testid="search-intro">
      <p class="mb-2">{{ intro.text }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted">{{ t('For example:') }}</span>
        <RouterLink v-for="e in intro.examples" :key="e" :to="{ name: route.name!, params: { script, q: e } }" class="chip pali hover:border-primary"
          data-testid="search-example">{{ conv(e) }}</RouterLink>
      </div>
    </div>

    <!-- full text search (v2 interface) -->
    <FtsResults v-if="route.name === 'search'" :q="q" />

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
import { watchDebounced } from '@vueuse/core'
import IconSearch from '~icons/lucide/search'
import IconHelp from '~icons/lucide/circle-question-mark'
import DictView from '@/components/DictView.vue'
import FtsResults from '@/components/FtsResults.vue'
import CollectionFilter from '@/components/CollectionFilter.vue'
import DictFilter from '@/components/DictFilter.vue'
import { useCollectionFilter } from '@/composables/filters'
import { useApi } from '@/data/api'
import type { TitleHit } from '@/data/types'
import { detectScript, toRoman, useScript } from '@/composables/script'
import { t } from '@/i18n'

const route = useRoute(), router = useRouter()
const api = useApi()
const { script, conv } = useScript()

const q = computed(() => (route.params.q as string | undefined) ?? '')
// the input keeps what the user typed (any script); it shows the query in the current script when it comes from the url
const input = ref(q.value ? conv(q.value) : '')
const inputScript = computed(() => detectScript(input.value))
watch(q, v => { if (toRoman(input.value.trim()) !== v) input.value = v ? conv(v) : '' })
watch(script, () => { input.value = q.value ? conv(q.value) : '' })
useHead({ title: computed(() => (q.value ? `${conv(q.value)} – ${t('Search')}` : t('Search'))) })

const { keys: collFilter } = useCollectionFilter()

const modes = computed(() => [{ name: 'search', label: t('Full text') }, { name: 'titles', label: t('Titles') }, { name: 'dict', label: t('Dictionary') }] as const)
const intro = computed(() => ({
  search: { text: t('Find a word or a phrase in all the texts. A word also finds its other endings.'), examples: ['nibbāna', 'evaṃ me sutaṃ', 'ānāpānassati'] },
  titles: { text: t('Find a sutta, a chapter or a book by its name.'), examples: ['brahmajāla', 'metta', 'satipaṭṭhāna'] },
  dict: { text: t('Look up a word in the dictionaries.'), examples: ['dhamma', 'nibbāna', 'saṅkhāra'] },
})[route.name as 'search' | 'titles' | 'dict'] ?? { text: '', examples: [] })

function go(replace: boolean) {
  const r = toRoman(input.value.trim())
  if (r === q.value) return
  const query = route.name === 'search' ? { ...route.query, combo: undefined } : {}
  const to = { name: route.name as string, params: { script: script.value, q: r || undefined }, query }
  if (replace) router.replace(to)
  else router.push(to)
}
const submit = () => go(false)
// search as you type (v2 behaviour) once every word has a few letters (short prefixes match too much)
watchDebounced(input, v => {
  const words = toRoman(v.trim()).split(/\s+/).filter(Boolean)
  if (!words.length || words.every(w => w.replace(/[*?]/g, '').length >= 3)) go(true)
}, { debounce: 500 })

// ---------------- titles ----------------
const titleHits = ref<TitleHit[]>([])
const loading = ref(false)
watch([() => route.name, q, collFilter], async () => {
  if (route.name !== 'titles' || !q.value) { titleHits.value = []; return }
  loading.value = true
  try { titleHits.value = await api.titles(q.value, collFilter.value, 200) } finally { loading.value = false }
}, { immediate: true })
</script>
