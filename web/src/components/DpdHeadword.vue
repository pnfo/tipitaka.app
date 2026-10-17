<!-- one DPD headword (Digital Pāḷi Dictionary, CC BY-NC-SA 4.0) -->
<template>
  <article class="border-b border-line py-2 last:border-0" data-testid="dpd-head">
    <button class="flex w-full items-baseline space-x-2 text-left" :aria-expanded="open" @click="open = !open">
      <span class="pali font-semibold">{{ conv(lemma) }}</span>
      <sup v-if="sense" class="text-[0.625rem] text-muted">{{ sense }}</sup>
      <span class="chip">{{ h.pos }}</span>
      <span class="min-w-0 flex-1"><b>{{ h.meaning || h.meaning2 }}</b><span v-if="h.meaningLit" class="text-muted"> · lit. {{ h.meaningLit }}</span></span>
    </button>
    <dl v-if="open" class="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[0.8125rem]">
      <template v-for="row in rows" :key="row[0]">
        <dt class="text-muted">{{ row[0] }}</dt>
        <dd :class="{ pali: row[2] }">{{ row[1] }}</dd>
      </template>
      <template v-if="h.example">
        <dt class="text-muted">{{ t('Example') }}</dt>
        <dd><i class="pali" v-html="cleanMeaning(convHtml(h.example, conv))" /> <span class="text-muted">{{ h.source }} {{ h.sutta }}</span></dd>
      </template>
    </dl>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DpdHead } from '@/data/types'
import { cleanMeaning, convHtml } from '@/composables/dict'
import { t } from '@/i18n'

const props = defineProps<{ h: DpdHead; conv: (s: string) => string; expanded?: boolean }>()
const open = ref(!!props.expanded)
// "dhamma 1.01" -> lemma dhamma, sense 1.01
const lemma = computed(() => props.h.lemma.replace(/\s+[\d.]+$/, ''))
const sense = computed(() => /\s([\d.]+)$/.exec(props.h.lemma)?.[1] ?? '')
const rows = computed(() => {
  const h = props.h
  const r: [string, string, boolean][] = []
  if (h.grammar) r.push([t('Grammar'), h.grammar, false])
  if (h.plusCase) r.push(['+', h.plusCase, false])
  if (h.root) r.push([t('Root'), `${h.root.root} ${h.root.group}${h.root.sign ? ' ' + h.root.sign : ''} (${h.root.meaning})`, false])
  if (h.rootBase) r.push([t('Base'), h.rootBase, false])
  if (h.construction) r.push([t('Construction'), h.construction.replace(/\n/g, '; '), false])
  if (h.compoundType) r.push([t('Compound'), `${h.compoundType}${h.compoundConstruction ? ' · ' + h.compoundConstruction : ''}`, false])
  if (h.derivedFrom) r.push([t('Derived from'), h.derivedFrom, false])
  if (h.meaning2 && h.meaning2 !== h.meaning) r.push([t('Buddhadatta'), h.meaning2, false])
  if (h.sanskrit) r.push([t('Sanskrit'), h.sanskrit, false])
  if (h.notes) r.push([t('Notes'), h.notes.replace(/<[^>]+>/g, ''), false])
  return r
})
</script>
