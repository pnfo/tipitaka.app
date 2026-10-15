<!-- the dictionaries used for lookups (settings.dicts, [] = all): a filter button with a dialog, or the bare list -->
<template>
  <template v-if="!inline">
    <button class="btn shrink-0" :class="[compact ? 'h-8 px-2' : 'h-10 px-3', { 'border-primary text-primary': !all }]" :title="t('Dictionaries')" data-testid="dict-filter" @click="open = true">
      <IconFilter class="h-4 w-4" />
      <span v-if="!compact" class="hidden sm:inline">{{ t('Dictionaries') }}</span>
      <span v-if="!all" class="rounded-full bg-primary px-1.5 text-[11px] text-white">{{ settings.dicts.length }}</span>
    </button>
    <Dialog :open="open" :title="t('Dictionaries')" testid="dict-dialog" @close="open = false">
      <DictList />
      <template #footer>
        <button class="btn" data-testid="dicts-all" @click="settings.dicts = []">{{ t('All') }}</button>
        <span class="flex-1" />
        <button class="btn-primary" data-testid="dicts-done" @click="open = false">{{ t('Done') }}</button>
      </template>
    </Dialog>
  </template>
  <DictList v-else />
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue'
import IconFilter from '~icons/lucide/list-filter'
import Dialog from './Dialog.vue'
import { useApi } from '@/data/api'
import type { Dict } from '@/data/types'
import { useSettings } from '@/stores/settings'
import { t } from '@/i18n'

defineProps<{ inline?: boolean; compact?: boolean }>()
const settings = useSettings()
const open = ref(false)
const dicts = ref<Dict[]>([])
useApi().dicts().then(d => { dicts.value = d }).catch(() => {})
const LANG_NAMES: Record<string, string> = { en: 'English', my: 'Myanmar', si: 'Sinhala', th: 'Thai', ch: 'Chinese', hi: 'Hindi', in: 'Indonesian', es: 'Spanish', pt: 'Portuguese', kh: 'Khmer' }
const codes = computed(() => ['dpd', ...dicts.value.map(d => d.code)])
const all = computed(() => settings.dicts.length === 0)
const isOn = (code: string) => all.value || settings.dicts.includes(code)

function toggle(code: string) {
  const on = new Set(all.value ? codes.value : settings.dicts)
  if (on.has(code)) {
    if (on.size === 1) return // keep at least one
    on.delete(code)
  } else on.add(code)
  settings.dicts = codes.value.every(c => on.has(c)) ? [] : codes.value.filter(c => on.has(c))
}

// the checklist, grouped by language (DPD first)
const DictList = defineComponent(() => () => {
  const groups: Record<string, Dict[]> = {}
  for (const d of dicts.value) (groups[d.lang] ??= []).push(d)
  const row = (code: string, label: string, sub?: string) => h('label', { class: 'flex cursor-pointer items-center gap-2 py-0.5 text-sm' }, [
    h('input', { type: 'checkbox', class: 'h-4 w-4', checked: isOn(code), 'data-testid': `dict-${code}`, onChange: () => toggle(code) }),
    h('span', label), sub ? h('span', { class: 'text-xs text-muted' }, sub) : null,
  ])
  return h('div', { class: 'space-y-3', 'data-testid': 'dict-list' }, [
    h('div', [h('div', { class: 'section-title' }, 'Pāḷi – English'), row('dpd', 'DPD', 'Digital Pāḷi Dictionary')]),
    ...Object.entries(groups).map(([lang, ds]) => h('div', [
      h('div', { class: 'section-title' }, LANG_NAMES[lang] ?? lang),
      h('div', { class: 'grid grid-cols-1 sm:grid-cols-2' }, ds.map(d => row(d.code, d.name))),
    ])),
  ])
})
</script>
