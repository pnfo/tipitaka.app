<!-- study panel: dictionary lookup of a tapped word and the commentary of a paragraph.
     A column on wide screens; on phones a bottom sheet of a fixed height that the user sets by dragging the handle
     (remembered in the settings, independent of the content). -->
<template>
  <aside v-if="ui.panelOpen" :class="wide ? 'sticky top-14 h-[calc(100vh-3.5rem)] w-[400px] shrink-0 border-l border-line bg-surface'
    : 'fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border-t border-line bg-surface shadow-2xl'"
    :style="wide ? undefined : { height: `${height}vh` }" data-testid="study-panel">
    <div class="flex h-full flex-col">
      <div v-if="!wide" class="flex h-5 shrink-0 cursor-row-resize touch-none items-center justify-center" role="separator" aria-orientation="horizontal"
        :aria-label="t('Drag to resize')" data-testid="sheet-handle" @pointerdown="startDrag">
        <div class="h-1.5 w-12 rounded-full bg-line" />
      </div>
      <div class="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <button v-for="tab in tabs" :key="tab.id" class="rounded-lg px-3 py-1.5 text-sm" :class="ui.panelTab === tab.id ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:bg-surface2'"
          :data-testid="`panel-tab-${tab.id}`" @click="ui.panelTab = tab.id">
          {{ tab.label }}<span v-if="tab.count" class="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-white" data-testid="gloss-count">{{ tab.count }}</span>
        </button>
        <span class="flex-1" />
        <RouterLink :to="{ name: 'help', params: { script }, hash: HELP[ui.panelTab] }" class="icon-btn text-muted" :aria-label="t('Help')" :title="t('Help')">
          <IconHelp class="h-4 w-4" /></RouterLink>
        <button class="icon-btn" :aria-label="t('Close')" data-testid="panel-close" @click="ui.panelOpen = false"><IconX class="h-5 w-5" /></button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <DictView v-if="ui.panelTab === 'dict'" :word="ui.lookupWord" mode="lookup" compact />
        <SettingView v-else-if="ui.panelTab === 'info'" />
        <!-- the explanation of the tapped word's underline, else the commentary of its paragraph -->
        <GlossView v-else-if="ui.lookupGlosses.length" :glosses="ui.lookupGlosses" />
        <LinksView v-else />
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import IconX from '~icons/lucide/x'
import IconHelp from '~icons/lucide/circle-question-mark'
import DictView from './DictView.vue'
import GlossView from './GlossView.vue'
import LinksView from './LinksView.vue'
import SettingView from './SettingView.vue'
import { useUi } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { useScript } from '@/composables/script'
import { t } from '@/i18n'

const ui = useUi(), settings = useSettings()
const { script } = useScript()
/** the section of the help of each tab */
const HELP = { dict: '#dictionary', links: '#commentary', info: '#places' }
const { width, height: vh } = useWindowSize()
const wide = computed(() => width.value >= 1200)
// the Commentary tab counts the explanations of the tapped word (one per commentary passage)
const glossCount = computed(() => new Set(ui.lookupGlosses.map(g => `${g.side}:${g.b}:${g.t}:${g.ts}`)).size)
const tabs = computed(() => [{ id: 'dict' as const, label: t('Dictionary'), count: 0 }, { id: 'links' as const, label: t('Commentary'), count: glossCount.value },
  // the setting (place, people) of the reading position, a tapped word or the paragraph of the menu
  { id: 'info' as const, label: t('Setting'), count: 0 }])

// sheet height in % of the screen: the saved value, or the live value while dragging
const dragging = ref<number | null>(null)
const height = computed(() => dragging.value ?? settings.sheetHeight)
const MIN = 20, MAX = 90, CLOSE_BELOW = 12

function startDrag(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  try { el.setPointerCapture(e.pointerId) } catch { /* synthetic events / old webviews */ }
  const startY = e.clientY, startH = height.value
  const move = (ev: PointerEvent) => {
    dragging.value = Math.min(MAX, Math.max(5, startH + ((startY - ev.clientY) / vh.value) * 100))
  }
  const up = () => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
    const h = dragging.value
    dragging.value = null
    if (h === null) return
    if (h < CLOSE_BELOW) ui.panelOpen = false // dragged down: close, keep the saved height
    else settings.sheetHeight = Math.round(Math.max(MIN, h))
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}
</script>
