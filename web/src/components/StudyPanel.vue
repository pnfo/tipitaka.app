<!-- study panel: dictionary lookup of a tapped word and the commentary of a paragraph.
     A column on wide screens, a bottom sheet on phones. -->
<template>
  <aside v-if="ui.panelOpen" :class="wide ? 'sticky top-14 h-[calc(100vh-3.5rem)] w-[400px] shrink-0 border-l border-line bg-surface'
    : 'fixed inset-x-0 bottom-0 z-40 flex max-h-[72vh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-2xl'" data-testid="study-panel">
    <div class="flex h-full flex-col">
      <div v-if="!wide" class="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line" />
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
import { computed } from 'vue'
import { useWindowSize } from '@vueuse/core'
import IconX from '~icons/lucide/x'
import DictView from './DictView.vue'
import LinksView from './LinksView.vue'
import { useUi } from '@/stores/ui'
import { t } from '@/i18n'

const ui = useUi()
const { width } = useWindowSize()
const wide = computed(() => width.value >= 1200)
const tabs = computed(() => [{ id: 'dict' as const, label: t('Dictionary') }, { id: 'links' as const, label: t('Commentary') }])
</script>
