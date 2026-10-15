<!-- dictionary results: DPD analysis (lookup of an inflected form) or a typed word, other dictionaries, breakups -->
<template>
  <div class="text-sm" style="overflow-wrap: anywhere" data-testid="dict-view">
    <div v-if="!word" class="py-8 text-center text-muted">{{ t('Tap a word in the text to look it up.') }}</div>
    <div v-else-if="loading" class="space-y-2 py-2" aria-busy="true">
      <div v-for="i in 4" :key="i" class="h-4 animate-pulse rounded bg-surface2" />
    </div>
    <div v-else-if="err" class="py-6 text-center text-muted">{{ err }}</div>
    <template v-else-if="res">
      <div class="mb-3 flex items-baseline space-x-2">
        <h2 class="pali text-xl font-semibold text-primary" data-testid="dict-word">{{ conv(res.word) }}</h2>
        <span v-if="script !== 'latn'" class="text-muted">{{ res.word }}</span>
        <span class="flex-1" />
        <RouterLink v-if="compact" :to="{ name: 'dict', params: { script, q: res.word } }" class="text-sm text-link underline">{{ t('More') }}</RouterLink>
        <DictFilter v-if="compact" compact />
      </div>

      <!-- DPD analysis of the form -->
      <div v-if="res.grammar?.length || res.deconstructor?.length" class="mb-3 rounded-lg bg-surface2 p-2.5">
        <div v-for="(g, i) in uniqueGrammar" :key="i" class="space-x-2">
          <span class="pali font-medium">{{ conv(g[0]) }}</span><span class="text-muted">{{ g[1] }}</span><span>{{ g[2] }}</span>
        </div>
        <div v-for="(d, i) in res.deconstructor ?? []" :key="'d' + i" class="pali">
          <IconSplit class="mr-1 inline h-3.5 w-3.5 text-muted" />{{ conv(d) }}
        </div>
      </div>

      <section v-if="res.dpd.length" class="mb-4">
        <div class="section-title flex items-center gap-2">DPD <span class="font-normal normal-case tracking-normal">· Digital Pāḷi Dictionary</span></div>
        <DpdHeadword v-for="h in shownDpd" :key="h.id" :h="h" :conv="conv" />
        <button v-if="res.dpd.length > shownDpd.length" class="text-sm text-link underline" @click="dpdAll = true">{{ t('Show {0} more', res.dpd.length - shownDpd.length) }}</button>
      </section>

      <section v-if="res.entries.length" class="mb-4">
        <div class="section-title">{{ t('Dictionaries') }}</div>
        <div v-for="(e, i) in res.entries" :key="i" class="border-b border-line py-2 last:border-0">
          <div class="mb-0.5 space-x-2">
            <span class="chip" :title="dictName(e.dict)">{{ dictShort(e.dict) }}</span>
            <span class="pali font-medium">{{ conv(e.word) }}</span>
          </div>
          <div class="meaning-html" v-html="clean(e.meaning)" />
        </div>
      </section>

      <section v-if="res.breakups.length" class="mb-4">
        <div class="section-title">{{ t('Breakup') }}</div>
        <div v-for="(b, i) in res.breakups" :key="i" class="pali">{{ conv(b.origin) }}</div>
      </section>

      <div v-if="!res.dpd.length && !res.entries.length && !res.breakups.length && !res.grammar?.length" class="py-4 text-center text-muted" data-testid="dict-empty">
        {{ t('No results') }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import IconSplit from '~icons/lucide/split'
import DpdHeadword from './DpdHeadword.vue'
import DictFilter from './DictFilter.vue'
import { ApiError, useApi } from '@/data/api'
import type { Dict, DictResult } from '@/data/types'
import { useScript } from '@/composables/script'
import { useSettings } from '@/stores/settings'
import { t } from '@/i18n'

const props = defineProps<{ word: string; mode: 'lookup' | 'dict'; compact?: boolean }>()
const api = useApi()
const settings = useSettings()
const { script, conv } = useScript()
const res = ref<DictResult | null>(null)
const loading = ref(false)
const err = ref('')
const dicts = ref<Dict[]>([])
const dpdAll = ref(false)

api.dicts().then(d => { dicts.value = d }).catch(() => {})
const dictShort = (code: string) => dicts.value.find(d => d.code === code)?.short ?? code
const dictName = (code: string) => { const d = dicts.value.find(x => x.code === code); return d ? `${d.name} (${d.lang})` : code }
const clean = (html: string) => DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p', 'hr', 'span', 'small', 'sup', 'sub', 'ul', 'ol', 'li', 'smallcaps'], ALLOWED_ATTR: ['class'] })

const shownDpd = computed(() => (dpdAll.value || !props.compact ? res.value?.dpd ?? [] : (res.value?.dpd ?? []).slice(0, 6)))
const uniqueGrammar = computed(() => {
  const seen = new Set<string>()
  return (res.value?.grammar ?? []).filter(g => { const k = g.join('|'); if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 8)
})

let gen = 0
watch(() => [props.word, props.mode, settings.dicts.join(',')] as const, async ([w]) => {
  dpdAll.value = false
  if (!w) { res.value = null; return }
  const my = ++gen
  loading.value = true
  err.value = ''
  try {
    const r = props.mode === 'lookup' ? await api.lookup(w, settings.dicts, 20) : await api.dict(w, settings.dicts, 100)
    if (my === gen) res.value = r
  } catch (e) {
    if (my === gen) err.value = e instanceof ApiError && e.code === 'no_dict' ? t('The dictionary is not installed.') : t('Dictionary lookup failed.')
  } finally {
    if (my === gen) loading.value = false
  }
}, { immediate: true })
</script>
