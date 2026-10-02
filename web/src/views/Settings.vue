<template>
  <div class="mx-auto max-w-3xl space-y-8 px-4 pb-20 pt-6">
    <h1 class="text-2xl font-semibold">{{ t('Settings') }}</h1>

    <section>
      <h2 class="section-title">{{ t('Pali script') }}</h2>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RouterLink v-for="s in SCRIPTS" :key="s.code" :to="{ name: 'settings', params: { script: s.code } }" replace
          class="rounded-lg border px-3 py-2" :class="s.code === script ? 'border-primary bg-primary-soft' : 'border-line hover:bg-surface2'" :data-testid="`set-script-${s.code}`">
          <div :data-script="s.code" class="text-lg" style="font-family: var(--font-text)">{{ sample(s.code) }}</div>
          <div class="text-xs text-muted">{{ s.name }}</div>
        </RouterLink>
      </div>
    </section>

    <section>
      <h2 class="section-title">{{ t('Select User Interface Language') }}</h2>
      <div class="flex flex-wrap gap-2">
        <button v-for="l in UI_LANGS" :key="l.code" class="chip text-sm" :class="{ on: settings.uiLang === l.code }" @click="settings.uiLang = l.code">{{ l.name }}</button>
      </div>
    </section>

    <section>
      <h2 class="section-title">{{ t('Appearance') }}</h2>
      <div class="mb-4 flex gap-2">
        <button v-for="th in THEMES" :key="th.id" class="flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm"
          :class="settings.theme === th.id ? 'border-primary' : 'border-line'" :style="{ background: th.bg, color: th.fg }" :data-testid="`theme-${th.id}`" @click="settings.theme = th.id">
          {{ th.label }}
        </button>
      </div>
      <div class="card space-y-4">
        <label class="flex items-center gap-3 text-sm"><span class="w-32 shrink-0">{{ t('Text size') }}</span>
          <input v-model.number="settings.textSize" type="range" min="14" max="30" step="1" class="flex-1"><span class="w-10 text-right text-muted">{{ settings.textSize }}</span></label>
        <label class="flex items-center gap-3 text-sm"><span class="w-32 shrink-0">{{ t('Line spacing') }}</span>
          <input v-model.number="settings.leading" type="range" min="1.3" max="2.2" step="0.05" class="flex-1"><span class="w-10 text-right text-muted">{{ settings.leading.toFixed(2) }}</span></label>
        <label class="flex items-center gap-3 text-sm"><span class="w-32 shrink-0">{{ t('Text width') }}</span>
          <input v-model.number="settings.width" type="range" min="520" max="1100" step="20" class="flex-1"><span class="w-10 text-right text-muted">{{ settings.width }}</span></label>
        <div class="reading rounded-lg bg-bg p-3" :data-script="script">
          <p class="para bodytext"><span class="num">1</span>{{ conv('Evaṃ me sutaṃ – ekaṃ samayaṃ bhagavā antarā ca rājagahaṃ antarā ca nāḷandaṃ addhānamaggappaṭipanno hoti mahatā bhikkhusaṅghena saddhiṃ pañcamattehi bhikkhusatehi.') }}</p>
        </div>
      </div>
    </section>

    <section>
      <h2 class="section-title">{{ t('Text') }}</h2>
      <div class="card space-y-3 text-sm">
        <div class="flex flex-wrap items-center gap-2"><span class="w-40">{{ t('Variant readings') }}</span>
          <button v-for="n in NOTES" :key="n.id" class="chip" :class="{ on: settings.notes === n.id }" @click="settings.notes = n.id">{{ n.label }}</button></div>
        <div class="flex flex-wrap items-center gap-2"><span class="w-40">{{ t('Page numbers') }}</span>
          <button v-for="e in EDITIONS" :key="e.id" class="chip" :class="{ on: settings.pageRefs.includes(e.id) }" :title="e.title" @click="toggleEdition(e.id)">{{ e.label }}</button></div>
        <label class="flex items-center gap-2"><input v-model="settings.paraNums" type="checkbox"> {{ t('Paragraph numbers') }}</label>
        <label class="flex items-center gap-2"><input v-model="settings.tapLookup" type="checkbox"> {{ t('Tap a word to look it up in the dictionary') }}</label>
      </div>
    </section>

    <section>
      <h2 class="section-title">{{ t('Dictionaries') }}</h2>
      <p class="mb-2 text-xs text-muted">{{ t('None selected = all dictionaries.') }}</p>
      <div class="card space-y-3 text-sm">
        <label class="flex items-center gap-2"><input type="checkbox" :checked="settings.dicts.includes('dpd')" @change="toggleDict('dpd')"> <b>DPD</b> – Digital Pāḷi Dictionary (English)</label>
        <div v-for="(group, lang) in byLang" :key="lang">
          <div class="mb-1 text-xs uppercase text-muted">{{ LANG_NAMES[lang] ?? lang }}</div>
          <label v-for="d in group" :key="d.code" class="mr-4 inline-flex items-center gap-1.5"><input type="checkbox" :checked="settings.dicts.includes(d.code)" @change="toggleDict(d.code)"> {{ d.name }}</label>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useHead } from '@unhead/vue'
import { SCRIPTS } from '@shared/scripts'
import { useApi } from '@/data/api'
import type { Dict } from '@/data/types'
import { convertTo, useScript } from '@/composables/script'
import { useSettings, type NotesMode, type Theme } from '@/stores/settings'
import { UI_LANGS, t } from '@/i18n'

const settings = useSettings()
const { script, conv } = useScript()
useHead({ title: t('Settings') })
const sample = (code: string) => convertTo('Buddho', code)
const THEMES: { id: Theme; label: string; bg: string; fg: string }[] = [
  { id: 'light', label: t('Light'), bg: '#fbf8f3', fg: '#2b2522' }, { id: 'sepia', label: t('Sepia'), bg: '#f4ecd8', fg: '#3b2f22' }, { id: 'dark', label: t('Dark'), bg: '#141211', fg: '#ece6df' },
]
const NOTES: { id: NotesMode; label: string }[] = [{ id: 'pointer', label: t('Marker') }, { id: 'inline', label: t('Inline') }, { id: 'hidden', label: t('Hidden') }]
const EDITIONS = [{ id: 'M', label: 'Myanmar', title: 'Myanmar (Chaṭṭha Saṅgāyana) edition' }, { id: 'V', label: 'VRI', title: 'VRI edition' }, { id: 'P', label: 'PTS', title: 'Pali Text Society edition' }, { id: 'T', label: 'Thai', title: 'Thai edition' }]
const LANG_NAMES: Record<string, string> = { en: 'English', my: 'Myanmar', si: 'Sinhala', th: 'Thai', ch: 'Chinese', hi: 'Hindi', in: 'Indonesian', es: 'Spanish', pt: 'Portuguese', kh: 'Khmer' }

function toggleEdition(id: string) {
  settings.pageRefs = settings.pageRefs.includes(id) ? settings.pageRefs.replace(id, '') : 'MVPT'.split('').filter(e => e === id || settings.pageRefs.includes(e)).join('')
}
const dicts = ref<Dict[]>([])
useApi().dicts().then(d => { dicts.value = d }).catch(() => {})
const byLang = computed(() => {
  const g: Record<string, Dict[]> = {}
  for (const d of dicts.value) (g[d.lang] ??= []).push(d)
  return g
})
function toggleDict(code: string) {
  settings.dicts = settings.dicts.includes(code) ? settings.dicts.filter(c => c !== code) : [...settings.dicts, code]
}
</script>
