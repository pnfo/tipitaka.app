<!-- /:script/search/:q (text), /:script/titles/:q, /:script/dict/:q - options are in the query string -->
<template>
  <div class="mx-auto max-w-4xl px-4 pb-20 pt-4">
    <form class="mb-3 flex gap-2" @submit.prevent="submit">
      <input v-model="input" class="input text-base" :data-script="inputScript" :style="inputScript !== 'latn' ? { fontFamily: 'var(--font-text)' } : undefined"
        :placeholder="t('Search')" type="search" autocapitalize="off" spellcheck="false" enterkeyhint="search" data-testid="search-page-input">
      <button class="btn-primary" type="submit"><IconSearch class="h-4 w-4" /></button>
    </form>
    <div class="mb-4 flex gap-1 border-b border-line" role="tablist">
      <RouterLink v-for="m in modes" :key="m.name" :to="{ name: m.name, params: { script, q: q || undefined }, query: m.name === 'search' ? route.query : {} }" role="tab"
        class="-mb-px border-b-2 px-3 py-2 text-sm" :class="route.name === m.name ? 'border-primary font-medium text-primary' : 'border-transparent text-muted hover:text-fg'"
        :data-testid="`mode-${m.name}`">{{ m.label }}</RouterLink>
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
import DictView from '@/components/DictView.vue'
import FtsResults from '@/components/FtsResults.vue'
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

const modes = computed(() => [{ name: 'search', label: t('Full text') }, { name: 'titles', label: t('Titles') }, { name: 'dict', label: t('Dictionary') }] as const)

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
watch([() => route.name, q], async () => {
  if (route.name !== 'titles' || !q.value) { titleHits.value = []; return }
  loading.value = true
  try { titleHits.value = await api.titles(q.value, undefined, 200) } finally { loading.value = false }
}, { immediate: true })
</script>
