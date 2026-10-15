<!-- Pāḷi script converter (v2 misc/convert): input in any script (auto detected), output in the chosen one -->
<template>
  <div class="mx-auto max-w-4xl px-4 pb-20 pt-6">
    <h1 class="mb-1 text-2xl font-semibold">{{ t('Pali Script Converter') }}</h1>
    <p class="mb-4 text-sm text-muted">{{ t('Paste Pāḷi text in any script; it is converted to the selected script.') }}</p>
    <textarea v-model="input" rows="8" class="input pali mb-3 text-base" :placeholder="t('Input text')" data-testid="convert-input" />
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <label class="text-sm text-muted">{{ t('Output script') }}</label>
      <select v-model="target" class="rounded-lg border border-line bg-surface px-2 py-1.5" data-testid="convert-target">
        <option v-for="s in SCRIPTS" :key="s.code" :value="s.code">{{ s.name }} – {{ s.native }}</option>
      </select>
      <span class="flex-1" />
      <button class="btn" :disabled="!output" @click="copy"><IconCopy class="h-4 w-4" />{{ t('Copy') }}</button>
    </div>
    <div class="card min-h-[8rem] whitespace-pre-wrap text-lg leading-relaxed" :data-script="target" style="font-family: var(--font-text)" data-testid="convert-output">{{ output }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useHead } from '@unhead/vue'
import { convertMixed } from '@pnfo/pali-converter'
import IconCopy from '~icons/lucide/copy'
import { SCRIPTS } from '@shared/scripts'
import { readJson, writeJson } from '@/stores/storage'
import { useScript } from '@/composables/script'
import { useUi } from '@/stores/ui'
import { t } from '@/i18n'

useHead({ title: computed(() => t('Pali Script Converter')) })
const { script } = useScript()
const ui = useUi()
const input = ref(readJson('tipitaka.app-convert-input', ''))
const target = ref(script.value)
watch(input, v => writeJson('tipitaka.app-convert-input', v.slice(0, 20000)))
const output = computed(() => (input.value ? convertMixed(input.value, target.value) : ''))
async function copy() {
  try { await navigator.clipboard.writeText(output.value); ui.showToast(t('Copied')) } catch { /* ignore */ }
}
</script>
