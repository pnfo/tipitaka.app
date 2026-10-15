<template>
  <div class="mx-auto max-w-3xl space-y-8 px-4 pb-20 pt-6">
    <h1 class="text-2xl font-semibold">{{ t('Settings') }}</h1>

    <section>
      <h2 class="section-title">{{ t('Pali script') }}</h2>
      <div data-testid="settings-script"><ScriptPicker /></div>
    </section>

    <section>
      <h2 class="section-title">{{ t('Tabs') }}</h2>
      <div class="flex flex-wrap gap-2">
        <button v-for="v in TAB_VIEWS" :key="v.id" class="chip text-sm" :class="{ on: settings.tabView === v.id }" :data-testid="`tabview-${v.id}`" @click="settings.tabView = v.id">{{ v.label }}</button>
      </div>
      <p class="mt-2 text-xs text-muted">{{ TAB_VIEWS.find(v => v.id === settings.tabView)?.desc }}</p>
      <label class="mt-2 flex items-center gap-2 text-sm"><input v-model="settings.syncScroll" type="checkbox"> {{ t('Scroll linked columns together (mūla / commentary)') }}</label>
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
          <input v-model.number="textSize" type="range" min="12" max="32" step="1" class="flex-1" data-testid="text-size"><span class="w-10 text-right text-muted">{{ textSize }}</span></label>
        <p class="-mt-2 pl-[8.75rem] text-xs text-muted">{{ t('Remembered for the {0} script.', uiLang === 'en' ? info.name : info.native) }}
          <button v-if="settings.textSizes[script] !== undefined" class="ml-1 underline" @click="resetSize">{{ t('Reset') }}</button></p>
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
      <div class="card"><DictFilter inline /></div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useHead } from '@unhead/vue'
import DictFilter from '@/components/DictFilter.vue'
import ScriptPicker from '@/components/ScriptPicker.vue'
import { computed } from 'vue'
import { useScript } from '@/composables/script'
import { textSizeOf, useSettings, type NotesMode, type TabView, type Theme } from '@/stores/settings'
import { UI_LANGS, t, uiLang } from '@/i18n'

const settings = useSettings()
const { script, conv, info } = useScript()
// text size of the current script (each script remembers its own)
const textSize = computed({
  get: () => textSizeOf(settings, script.value),
  set: (v: number) => { settings.textSizes = { ...settings.textSizes, [script.value]: v } },
})
function resetSize() {
  const rest = { ...settings.textSizes }
  delete rest[script.value]
  settings.textSizes = rest
}
useHead({ title: computed(() => t('Settings')) })
// computed: the labels follow a change of the interface language
const TAB_VIEWS = computed<{ id: TabView; label: string; desc: string }[]>(() => [
  { id: 'single', label: t('Single'), desc: t('Opening a text replaces the current one.') },
  { id: 'tabbed', label: t('Tabs'), desc: t('Every text opens in a new tab.') },
  { id: 'columns', label: t('Columns'), desc: t('Open texts are shown side by side (on wide screens).') },
])
const THEMES = computed<{ id: Theme; label: string; bg: string; fg: string }[]>(() => [
  { id: 'light', label: t('Light'), bg: '#fbf8f3', fg: '#2b2522' }, { id: 'sepia', label: t('Sepia'), bg: '#f4ecd8', fg: '#3b2f22' }, { id: 'dark', label: t('Dark'), bg: '#141211', fg: '#ece6df' },
])
const NOTES = computed<{ id: NotesMode; label: string }[]>(() => [{ id: 'pointer', label: t('Marker') }, { id: 'inline', label: t('Inline') }, { id: 'hidden', label: t('Hidden') }])
const EDITIONS = computed(() => [
  { id: 'M', label: t('Myanmar'), title: t('Myanmar (Chaṭṭha Saṅgāyana) edition') }, { id: 'V', label: 'VRI', title: t('VRI edition') },
  { id: 'P', label: 'PTS', title: t('Pali Text Society edition') }, { id: 'T', label: t('Thai'), title: t('Thai edition') },
])

function toggleEdition(id: string) {
  settings.pageRefs = settings.pageRefs.includes(id) ? settings.pageRefs.replace(id, '') : 'MVPT'.split('').filter(e => e === id || settings.pageRefs.includes(e)).join('')
}
</script>
