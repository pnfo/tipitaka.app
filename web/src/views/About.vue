<template>
  <div class="mx-auto max-w-3xl space-y-6 px-4 pb-20 pt-6 text-[0.9375rem] leading-relaxed">
    <h1 class="text-2xl font-semibold">{{ t('About') }}</h1>
    <p>{{ t('Tipiṭaka.app presents the Chaṭṭha Saṅgāyana Tipiṭaka with its commentaries (aṭṭhakathā), sub-commentaries (ṭīkā) and other Pāḷi texts, in 22 scripts, with full text search and dictionaries.') }}</p>
    <section class="card space-y-2" data-testid="about-contact">
      <h2 class="font-semibold">{{ t('Contact') }}</h2>
      <p>{{ t('Questions, suggestions and bug reports are welcome:') }}
        <a class="text-link underline" href="mailto:path.nirvana@gmail.com">path.nirvana@gmail.com</a> ·
        <a class="text-link underline" href="https://github.com/pnfo/tipitaka.app/issues">GitHub</a></p>
    </section>
    <section class="card space-y-2">
      <h2 class="font-semibold">{{ t('Sources') }}</h2>
      <p>{{ t('Text') }}: <a class="text-link underline" href="https://github.com/VipassanaTech/tipitaka-xml">Vipassana Research Institute – Chaṭṭha Saṅgāyana Tipiṭaka (CST)</a>.
        {{ t('Free for non-commercial use. Corrections are synchronised from the VRI repository.') }}
        <span v-if="meta" class="text-xs text-muted">({{ meta.upstream.slice(0, 10) }})</span></p>
      <p>DPD: <a class="text-link underline" href="https://www.dpdict.net/">Digital Pāḷi Dictionary</a> {{ t('by {0}', 'Bodhirasa Bhikkhu') }}, CC BY-NC-SA 4.0.
        <span v-if="meta?.dpdVersion" class="text-xs text-muted">({{ meta.dpdVersion }})</span></p>
      <p><a class="text-link underline" href="https://ancient-buddhist-texts.net/Textual-Studies/DPPN/index.htm">Dictionary of Pāli Proper Names</a>
        {{ t('by {0}', 'G. P. Malalasekera') }}, {{ t('revised by {0}', 'Ānandajoti Bhikkhu') }} (2025), CC BY-SA 4.0.
        <a class="text-link underline" href="https://ancient-buddhist-texts.net/Textual-Studies/PTSPED/index.htm">Pali-English Dictionary</a>
        {{ t('by {0}', 'T. W. Rhys Davids, W. Stede') }}, {{ t('edition of {0}', 'Ānandajoti Bhikkhu') }} (2025), © Pali Text Society, CC BY-NC 3.0.</p>
      <p>Critical Pāli Dictionary (<a class="text-link underline" href="https://cpd.uni-koeln.de/">cpd.uni-koeln.de</a>), Nyanatiloka’s
        Buddhist Dictionary (© Buddhist Publication Society): {{ t('as collected by the Digital Pāḷi Dictionary project') }};
        New Concise Pali-English Dictionary (<a class="text-link underline" href="https://suttacentral.net/">SuttaCentral</a>);
        {{ t('Pāli-Sinhala dictionaries') }} (<a class="text-link underline" href="https://github.com/pnfo/pali-sinhala-dictionary">pali-sinhala-dictionary</a>);
        {{ t('Pāli-Vietnamese and Pāli-Korean dictionaries') }}: <a class="text-link underline" href="https://github.com/palipced/palipced.github.io">PCED</a> {{ t('by {0}', 'Alobha') }}.
        {{ t('The Pāli-Thai PTS dictionary was revised and completed with AI (Claude, 2026) from the PTS 2025 edition; the passages translated by AI are marked.') }}</p>
      <p>{{ t('Other dictionaries: Buddhadatta, PTS, Nyanatiloka, DPPN, Critical Pāli Dictionary, Myanmar, Sinhala, Thai, Chinese, Hindi, Indonesian, Spanish, Portuguese and Khmer dictionaries.') }}</p>
      <p>{{ t('Places and people') }}: {{ t('the names of DPD and the DPPN; their mentions were found with the help of AI (Claude, 2026).') }}
        {{ t('Places, mahājanapadas, journeys') }}: <a class="text-link underline" href="https://suttacentral.net/map">SuttaCentral</a> (CC0).
        {{ t('Map') }}: <a class="text-link underline" href="https://www.naturalearthdata.com">Natural Earth</a> ({{ t('public domain') }}),
        <a class="text-link underline" href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>,
        <a class="text-link underline" href="https://s2maps.eu">Sentinel-2 cloudless</a> {{ t('by {0}', 'EOX') }} (CC BY 4.0),
        <a class="text-link underline" href="https://leafletjs.com">Leaflet</a>.</p>
    </section>
    <p v-if="meta" class="text-xs text-muted">{{ t('data') }} {{ meta.contentHash }} · {{ meta.builtAt.slice(0, 10) }}</p>
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
