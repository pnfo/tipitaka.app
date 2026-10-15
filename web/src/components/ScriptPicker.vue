<!-- script selector: the url prefix changes, the rest of the route is kept -->
<template>
  <button ref="btn" class="btn h-9 shrink-0 px-2 sm:px-2.5" :aria-label="t('Pali script')" aria-haspopup="dialog" data-testid="script-picker" @click="open = !open">
    <IconLanguages class="hidden h-4 w-4 text-muted sm:inline" />
    <span class="max-w-[6rem] truncate" :data-script="script" style="font-family: var(--font-text)">{{ info.native }}</span>
  </button>
  <Floating :open="open" :anchor="btn ?? null" align="end" @close="open = false">
    <div class="w-[min(92vw,420px)]">
      <div class="section-title px-1">{{ t('Pali script') }}</div>
      <div class="grid grid-cols-2 gap-1 sm:grid-cols-3">
        <button v-for="s in SCRIPTS" :key="s.code" class="flex flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-surface2"
          :class="{ 'bg-primary-soft text-primary': s.code === script }" :data-testid="`script-${s.code}`" @click="pick(s.code)">
          <span class="text-base leading-tight" :data-script="s.code" style="font-family: var(--font-text)">{{ sample(s.code) }}</span>
          <span class="text-[0.6875rem] text-muted">{{ s.name }}</span>
        </button>
      </div>
    </div>
  </Floating>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { changeScript } from '@/router'
import IconLanguages from '~icons/lucide/languages'
import Floating from './Floating.vue'
import { SCRIPTS } from '@shared/scripts'
import { convertTo, useScript } from '@/composables/script'
import { t } from '@/i18n'

const { script, info } = useScript()
const router = useRouter()
const open = ref(false)
const btn = ref<HTMLElement>()
const sample = (code: string) => convertTo('Dhamma', code)

function pick(code: string) {
  open.value = false
  changeScript(router, code)
}
</script>
