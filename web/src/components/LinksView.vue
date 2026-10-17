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
    // one passage per linked book: its linked paragraphs from the first one on (the paragraphs of an explanation are
    // all linked), or the first paragraph and the unnumbered ones after it (paragraph number links)
    const byBook = new Map<number, typeof links>()
    for (const l of links) byBook.set(l.b, [...(byBook.get(l.b) ?? []), l])
    const out: typeof items.value = []
    for (const ls of [...byBook.values()].slice(0, 4)) {
      const ts = [...new Set(ls.map(l => l.t))].sort((a, b) => a - b)
      let n = 1
      while (n < ts.length && n < 6 && ts[n] - ts[n - 1] <= 2) n++
      const first = ls.find(l => l.t === ts[0])!
      const count = Math.max(ts[n - 1] - ts[0] + 1, 3)
      const [info, chunk] = await Promise.all([api.node(first.k), api.text(first.k, ts[0], count)])
      const paras = n > 1 ? chunk.paras : chunk.paras.filter((p, i) => i === 0 || !p.n)
      out.push({ key: first.k, title: info.title, coll: info.coll, para: ts[0], paras })
    }
    items.value = out
  } finally { loading.value = false }
}, { immediate: true })
</script>
