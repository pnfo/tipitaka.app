<!-- the commentary of a tapped underlined word (Commentary tab of the study panel): the explanation in the
     aṭṭhakathā / ṭīkā from the lemma to the next lemma; for a lemma in a commentary, the words it quotes in context -->
<template>
  <section data-testid="gloss-view">
    <div v-if="loading" class="h-16 animate-pulse rounded bg-surface2" />
    <div v-for="it in items" :key="it.id" class="mb-3" :class="`coll-${it.coll}`" data-testid="gloss-item">
      <div class="mb-1 flex items-center gap-2 text-xs text-muted">
        <span class="coll-dot" /><span class="pali min-w-0 flex-1 truncate">{{ conv(it.title) }}</span>
        <button class="text-link underline" data-testid="gloss-alongside" @click="ui.alongside = { key: it.key, para: it.para }">
          {{ alongside[0] }}<span class="pali pali-inline">{{ conv(COLL_NAME[it.coll]) }}</span>{{ alongside[1] }}
        </button>
      </div>
      <div class="reading rounded-lg border border-line p-3" style="font-size: 0.95rem">
        <div v-for="p in it.paras" :key="p.p.i" :class="paraClass(p.p)" v-html="paraHtml(p.p, conv, opts, p.spans)" />
        <div v-if="it.more" class="text-center text-muted">…</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Span } from '@shared/markup'
import { useApi } from '@/data/api'
import type { Coll, Gloss, Para } from '@/data/types'
import { useScript } from '@/composables/script'
import { COLL_NAME } from '@/composables/filters'
import { lemmaOpen } from '@/composables/glosses'
import { paraClass, paraHtml } from '@/composables/text'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { t } from '@/i18n'

const props = defineProps<{ glosses: Gloss[] }>()
const api = useApi()
const ui = useUi(), settings = useSettings()
const { conv } = useScript()
const opts = computed(() => ({ notes: settings.notes, pageRefs: '', paraNums: false, highlight: null }))
const alongside = computed(() => t('Open {0} alongside', '\u0000').split('\u0000'))

interface Item { id: string; key: string; title: string; coll: Coll; para: number; paras: { p: Para; spans: Span[] }[]; more: boolean }
const items = ref<Item[]>([])
const loading = ref(false)
const MAX_PARAS = 8
const MARK = 'gl gl-hover'

watch(() => props.glosses, async gs => {
  loading.value = true
  const out: Item[] = []
  try {
    // one item per commentary passage (a mūla word has an aṭṭhakathā gloss and the ṭīkā's chained to it)
    const seen = new Set<string>()
    const sorted = [...gs].sort((a, b) => a.kind.localeCompare(b.kind) || b.conf - a.conf)
    for (const g of sorted.slice(0, 6)) {
      const id = `${g.side}:${g.b}:${g.t}:${g.ts}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push(await (g.side === 't' ? explanation(g, id) : quoted(g, id)))
    }
  } catch { /* shown as far as loaded */ } finally {
    items.value = out
    loading.value = false
  }
}, { immediate: true })

/** the commentary from the lemma to the end of its explanation, the lemma marked */
async function explanation(g: Gloss, id: string): Promise<Item> {
  const count = Math.min(g.xi - g.t + 1, MAX_PARAS)
  const [info, chunk] = await Promise.all([api.node(g.k), api.text(g.k, g.t, count)])
  const paras = chunk.paras.map(p => {
    let text = p.t, off = 0
    if (p.i === g.t) { off = lemmaOpen(p.t, g.ts); text = text.slice(off) }
    if (p.i === g.xi) text = text.slice(0, g.x - off)
    const s = p.i === g.t ? g.ts - off : 0
    const e = p.i === g.tei ? g.te - off : p.i < g.tei ? Number.MAX_SAFE_INTEGER : 0
    return { p: { ...p, t: text, n: undefined }, spans: e > s ? [{ s, e, id: String(g.g), cls: MARK }] : [] }
  }).filter(x => x.p.t.trim())
  return { id, key: g.k, title: info.title, coll: info.coll, para: g.t, paras, more: g.xi - g.t + 1 > count }
}

/** the words a lemma quotes, in their paragraphs */
async function quoted(g: Gloss, id: string): Promise<Item> {
  const count = Math.min(g.tei - g.t + 1, MAX_PARAS)
  const [info, chunk] = await Promise.all([api.node(g.k), api.text(g.k, g.t, count)])
  const paras = chunk.paras.map(p => {
    const s = p.i === g.t ? g.ts : 0
    const e = p.i === g.tei ? g.te : Number.MAX_SAFE_INTEGER
    return { p, spans: [{ s, e, id: String(g.g), cls: MARK }] }
  })
  return { id, key: g.k, title: info.title, coll: info.coll, para: g.t, paras, more: false }
}
</script>
