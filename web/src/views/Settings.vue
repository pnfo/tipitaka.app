<template>
  <div class="mx-auto max-w-3xl space-y-6 px-4 pb-20 pt-5">
    <PageTitle :title="t('Settings')" />

    <section>
      <h2 class="section-title">{{ t('Pali script') }}</h2>
      <!-- the common scripts, the others behind More (and the current one when it is not common) -->
      <div class="flex flex-wrap items-center gap-2" data-testid="settings-script">
        <button v-for="s in shownScripts" :key="s.code" class="btn h-9" :class="{ on: s.code === script }" :aria-pressed="s.code === script"
          :data-testid="`settings-script-${s.code}`" @click="changeScript(router, s.code)">
          <span :data-script="s.code" style="font-family: var(--font-text)">{{ s.native }}</span>
          <span v-if="s.code !== 'latn'" class="text-xs text-muted">{{ s.name }}</span>
        </button>
        <ScriptPicker more />
      </div>
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
        <button v-for="l in UI_LANGS" :key="l.code" class="btn h-9" :class="{ on: settings.uiLang === l.code }" @click="settings.uiLang = l.code">{{ l.name }}</button>
      </div>
    </section>

    <section>
      <h2 class="section-title">{{ t('Appearance') }}</h2>
      <!-- swatches; auto (light or dark as the system) is split between the two -->
      <div class="mb-4 grid grid-cols-5 gap-1.5 sm:gap-2">
        <button v-for="th in THEMES" :key="th.id" class="flex min-w-0 items-center justify-center rounded-lg border px-1 py-3 text-sm"
          :class="settings.theme === th.id ? 'border-primary ring-2 ring-primary' : 'border-line'" :style="{ background: th.bg, color: th.fg }"
          :aria-pressed="settings.theme === th.id" :data-testid="`theme-${th.id}`" @click="settings.theme = th.id">
          <span class="truncate" :class="th.id === 'auto' ? 'rounded bg-[#fbf8f3]/90 px-1' : ''">{{ th.label }}</span>
        </button>
      </div>
      <div class="card space-y-4">
        <label class="flex items-center gap-3 text-sm"><span class="w-32 shrink-0">{{ t('Text size') }}</span>
          <input v-model.number="settings.textSize" type="range" min="12" max="32" step="1" class="flex-1" data-testid="text-size"><span class="w-10 text-right text-muted">{{ settings.textSize }}</span></label>
        <label class="flex items-center gap-3 text-sm"><span class="w-32 shrink-0">{{ t('Line spacing') }}</span>
          <input v-model.number="settings.leading" type="range" min="1.3" max="2.2" step="0.05" class="flex-1"><span class="w-10 text-right text-muted">{{ settings.leading.toFixed(2) }}</span></label>
        <label class="flex items-center gap-3 text-sm"><span class="w-32 shrink-0">{{ t('Text width') }}</span>
          <input v-model.number="settings.width" type="range" min="520" max="1100" step="20" class="flex-1"><span class="w-10 text-right text-muted">{{ settings.width }}</span></label>
        <label class="flex items-center gap-2 text-sm"><input v-model="settings.autoHideHeader" type="checkbox"> {{ t('Hide the top bar when scrolling down (small screens)') }}</label>
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
        <label class="flex items-center gap-2"><input v-model="settings.glosses" type="checkbox" data-testid="glosses-setting"> {{ t('Underline the words explained in the commentaries') }}</label>
      </div>
    </section>

    <section>
      <h2 class="section-title">{{ t('Dictionaries') }}</h2>
      <div class="card"><DictFilter inline /></div>
    </section>
  </div>
</template>

<script setup lang="ts">
import PageTitle from '@/components/PageTitle.vue'
import { useHead } from '@unhead/vue'
import DictFilter from '@/components/DictFilter.vue'
import ScriptPicker from '@/components/ScriptPicker.vue'
import { computed } from 'vue'
import { COMMON_SCRIPTS, useScript } from '@/composables/script'
import { SCRIPTS } from '@shared/scripts'
import { useRouter } from 'vue-router'
import { changeScript } from '@/router'
import { useSettings, type NotesMode, type TabView } from '@/stores/settings'
import { useThemes } from '@/composables/themes'
import { UI_LANGS, t } from '@/i18n'

const settings = useSettings()
const router = useRouter()
const shownScripts = computed(() => SCRIPTS.filter(s => COMMON_SCRIPTS.includes(s.code) || s.code === script.value)
  .sort((a, b) => rank(a.code) - rank(b.code)))
const rank = (code: string) => (COMMON_SCRIPTS.includes(code) ? COMMON_SCRIPTS.indexOf(code) : COMMON_SCRIPTS.length)
const { script, conv } = useScript()
useHead({ title: computed(() => t('Settings')) })
// computed: the labels follow a change of the interface language
const TAB_VIEWS = computed<{ id: TabView; label: string; desc: string }[]>(() => [
  { id: 'single', label: t('Single'), desc: t('Opening a text replaces the current one.') },
  { id: 'tabbed', label: t('Tabs'), desc: t('Every text opens in a new tab.') },
  { id: 'columns', label: t('Columns'), desc: t('Open texts are shown side by side (on wide screens).') },
])
const THEMES = useThemes()
const NOTES = computed<{ id: NotesMode; label: string }[]>(() => [{ id: 'pointer', label: t('Marker') }, { id: 'inline', label: t('Inline') }, { id: 'hidden', label: t('Hidden') }])
const EDITIONS = computed(() => [
  { id: 'M', label: t('Myanmar'), title: t('Myanmar (Chaṭṭha Saṅgāyana) edition') }, { id: 'V', label: 'VRI', title: t('VRI edition') },
  { id: 'P', label: 'PTS', title: t('Pali Text Society edition') }, { id: 'T', label: t('Thai'), title: t('Thai edition') },
])

function toggleEdition(id: string) {
  settings.pageRefs = settings.pageRefs.includes(id) ? settings.pageRefs.replace(id, '') : 'MVPT'.split('').filter(e => e === id || settings.pageRefs.includes(e)).join('')
}
</script>
