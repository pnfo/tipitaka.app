<!-- interface language selector (the menu): each language in its own writing, with its English name -->
<template>
  <button ref="btn" class="btn h-9 shrink-0 px-2.5" :aria-label="t('Interface language')" aria-haspopup="dialog" data-testid="lang-picker" @click="open = !open">
    <IconGlobe class="h-4 w-4 text-muted" />
    <span class="max-w-[6rem] truncate">{{ current.name }}</span>
  </button>
  <Floating :open="open" :anchor="btn ?? null" align="end" @close="open = false">
    <div class="w-[min(92vw,300px)]">
      <div class="section-title px-1">{{ t('Interface language') }}</div>
      <div class="grid grid-cols-2 gap-1">
        <button v-for="l in UI_LANGS" :key="l.code" class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface2"
          :class="{ 'bg-primary-soft text-primary': l.code === settings.uiLang }" :aria-pressed="l.code === settings.uiLang" :data-testid="`lang-${l.code}`" @click="pick(l.code)">
          <span class="min-w-0 flex-1">
            <span class="block text-base leading-tight">{{ l.name }}</span>
            <span v-if="l.english !== l.name" class="block text-[0.6875rem] text-muted">{{ l.english }}</span>
          </span>
          <IconCheck v-if="l.code === settings.uiLang" class="h-4 w-4 shrink-0" />
        </button>
      </div>
    </div>
  </Floating>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import IconGlobe from '~icons/lucide/globe'
import IconCheck from '~icons/lucide/check'
import Floating from './Floating.vue'
import { useSettings } from '@/stores/settings'
import { UI_LANGS, t } from '@/i18n'

const settings = useSettings()
const open = ref(false)
const btn = ref<HTMLElement>()
const current = computed(() => UI_LANGS.find(l => l.code === settings.uiLang) ?? UI_LANGS[0])
function pick(code: string) {
  open.value = false
  settings.uiLang = code
}
</script>
