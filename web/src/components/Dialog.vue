<!-- modal dialog: centered on wide screens, a sheet from the bottom on phones -->
<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center bg-black sm:items-center sm:p-4" style="background: rgba(0, 0, 0, .4)"
      @click.self="$emit('close')" @keydown.esc="$emit('close')">
      <div class="flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-surface text-fg shadow-xl sm:rounded-2xl" :style="{ maxWidth: width ?? '480px' }"
        role="dialog" aria-modal="true" :aria-label="title" :data-testid="testid">
        <div class="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 class="flex-1 text-base font-semibold">{{ title }}</h2>
          <button class="icon-btn" :aria-label="t('Close')" data-testid="dialog-close" @click="$emit('close')"><IconX class="h-5 w-5" /></button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <slot />
        </div>
        <div v-if="$slots.footer" class="flex items-center gap-2 border-t border-line px-4 py-3"><slot name="footer" /></div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import IconX from '~icons/lucide/x'
import { t } from '@/i18n'

const props = defineProps<{ open: boolean; title: string; width?: string; testid?: string }>()
const emit = defineEmits<{ close: [] }>()
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
watch(() => props.open, o => {
  if (o) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
}, { immediate: true })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>
