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
          @click="ui.panelTab = tab.id">{{ tab.label }}</button>
        <span class="flex-1" />
        <button class="icon-btn" :aria-label="t('Close')" data-testid="panel-close" @click="ui.panelOpen = false"><IconX class="h-5 w-5" /></button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <DictView v-if="ui.panelTab === 'dict'" :word="ui.lookupWord" mode="lookup" compact />
        <LinksView v-else-if="ui.panelTab === 'links'" />
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import IconX from '~icons/lucide/x'
import DictView from './DictView.vue'
import LinksView from './LinksView.vue'
import { useUi } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { t } from '@/i18n'

const ui = useUi(), settings = useSettings()
const { width, height: vh } = useWindowSize()
const wide = computed(() => width.value >= 1200)
const tabs = computed(() => [{ id: 'dict' as const, label: t('Dictionary') }, { id: 'links' as const, label: t('Commentary') }])

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
