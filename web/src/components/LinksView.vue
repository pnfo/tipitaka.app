<!-- commentary (aṭṭhakathā / ṭīkā) and mūla paragraphs linked to the selected paragraph -->
<template>
  <div class="text-sm" data-testid="links-view">
    <div v-if="!ui.linkTarget" class="py-8 text-center text-muted">{{ t('Tap a paragraph number to see its commentary.') }}</div>
    <div v-else-if="loading" class="h-20 animate-pulse rounded bg-surface2" />
    <div v-else-if="!items.length" class="py-8 text-center text-muted" data-testid="links-empty">{{ t('No linked commentary for this paragraph.') }}</div>
    <div v-for="it in items" v-else :key="it.key + it.para" class="mb-4" :class="`coll-${it.coll}`">
      <RouterLink :to="{ name: 'read', params: { script, key: it.key }, hash: `#p${it.para}` }" class="mb-1 flex items-center gap-2 text-xs text-muted hover:text-primary">
        <span class="coll-dot" /><span class="pali truncate">{{ conv(it.title) }}</span>
      </RouterLink>
      <div class="reading rounded-lg border border-line p-3" style="font-size: 0.95rem">
        <div v-for="p in it.paras" :key="p.i" :class="paraClass(p)" v-html="paraHtml(p, conv, opts)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApi } from '@/data/api'
import type { Coll, Para } from '@/data/types'
import { useScript } from '@/composables/script'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { paraClass, paraHtml } from '@/composables/text'
import { t } from '@/i18n'

const ui = useUi(), settings = useSettings()
const api = useApi()
const { script, conv } = useScript()
const loading = ref(false)
const items = ref<{ key: string; title: string; coll: Coll; para: number; paras: Para[] }[]>([])
const opts = computed(() => ({ notes: settings.notes, pageRefs: settings.pageRefs, paraNums: true, highlight: null }))

watch(() => ui.linkTarget, async lt => {
  if (!lt) return
  loading.value = true
  try {
    const links = await api.links(lt.key, lt.para, lt.para + 1)
    const out: typeof items.value = []
    for (const l of links.slice(0, 6)) {
      const [info, chunk] = await Promise.all([api.node(l.k), api.text(l.k, l.t, 3)])
      // the linked paragraph and the following ones of the same number block
      out.push({ key: l.k, title: info.title, coll: info.coll, para: l.t, paras: chunk.paras.filter((p, i) => i === 0 || !p.n) })
    }
    items.value = out
  } finally { loading.value = false }
}, { immediate: true })
</script>
