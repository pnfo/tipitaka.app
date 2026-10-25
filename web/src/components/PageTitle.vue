<!-- the title of a page opened from the menu (router.ts SECONDARY), with a close button back to the page before it -->
<template>
  <div class="flex items-center gap-2">
    <h1 class="min-w-0 flex-1 text-2xl font-semibold">{{ title }}</h1>
    <slot />
    <button class="icon-btn -mr-2" :aria-label="t('Close')" :title="t('Close')" data-testid="page-close" @click="close"><IconX class="h-5 w-5" /></button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import IconX from '~icons/lucide/x'
import { useUi } from '@/stores/ui'
import { useScript } from '@/composables/script'
import { t } from '@/i18n'

defineProps<{ title: string }>()
const ui = useUi(), router = useRouter()
const { script } = useScript()
const close = () => router.push(ui.lastPage || { name: 'home', params: { script: script.value } })
</script>
