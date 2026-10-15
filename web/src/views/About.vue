<template>
  <div class="mx-auto max-w-3xl space-y-6 px-4 pb-20 pt-6 text-[15px] leading-relaxed">
    <h1 class="text-2xl font-semibold">{{ t('About') }}</h1>
    <p>{{ t('Tipiṭaka.app presents the Chaṭṭha Saṅgāyana Tipiṭaka with its commentaries (aṭṭhakathā), sub-commentaries (ṭīkā) and other Pāḷi texts, in 22 scripts, with full text search and dictionaries.') }}</p>
    <section class="card space-y-2">
      <h2 class="font-semibold">{{ t('Sources') }}</h2>
      <p>{{ t('Text') }}: <a class="text-link underline" href="https://github.com/VipassanaTech/tipitaka-xml">Vipassana Research Institute – Chaṭṭha Saṅgāyana Tipiṭaka (CST)</a>.
        {{ t('Free for non-commercial use. Corrections are synchronised from the VRI repository.') }}
        <span v-if="meta" class="text-xs text-muted">({{ meta.upstream.slice(0, 10) }})</span></p>
      <p>DPD: <a class="text-link underline" href="https://www.dpdict.net/">Digital Pāḷi Dictionary</a> by Bodhirasa Bhikkhu, CC BY-NC-SA 4.0.
        <span v-if="meta?.dpdVersion" class="text-xs text-muted">({{ meta.dpdVersion }})</span></p>
      <p>{{ t('Other dictionaries: Buddhadatta, PTS, Nyanatiloka, DPPN, Critical Pāli Dictionary, Myanmar, Sinhala, Thai, Chinese, Hindi, Indonesian, Spanish, Portuguese and Khmer dictionaries.') }}</p>
    </section>
    <section class="card space-y-2">
      <h2 class="font-semibold">{{ t('Apps') }}</h2>
      <p>{{ t('The same app works offline on Android and on Windows, macOS and Linux.') }}</p>
      <div class="flex flex-wrap gap-2">
        <a class="btn" href="https://play.google.com/store/apps/details?id=app.tipitaka.main">Android</a>
        <a class="btn" href="https://github.com/pnfo/tipitaka.app/releases">Windows · macOS · Linux</a>
      </div>
    </section>
    <p class="text-sm text-muted">{{ t('Suggestions and errors') }}: <a class="underline" href="mailto:path.nirvana@gmail.com">path.nirvana@gmail.com</a> ·
      <a class="underline" href="https://github.com/pnfo/tipitaka.app">GitHub</a></p>
    <p v-if="meta" class="text-xs text-muted">data {{ meta.contentHash }} · {{ meta.builtAt.slice(0, 10) }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useHead } from '@unhead/vue'
import { useApi } from '@/data/api'
import type { Meta } from '@/data/types'
import { t } from '@/i18n'

useHead({ title: computed(() => t('About')) })
const meta = ref<Meta | null>(null)
useApi().meta().then(m => { meta.value = m }).catch(() => {})
</script>
