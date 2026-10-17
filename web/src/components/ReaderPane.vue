<!--
  One open text (tab): a group's contents or the text stream of a book starting at the tab's node.
  Reports the reading position (visible) and keeps the paragraph links of the loaded text (column sync).
-->
<template>
  <div :class="contained ? 'flex h-full min-w-0 flex-col' : ''" :data-testid="contained ? 'column' : 'reader'">
    <!-- column header (columns view) -->
    <div v-if="contained" class="flex items-center gap-2 border-b border-line px-3 py-1.5 text-sm" :class="[`coll-${info?.coll ?? 'mula'}`, active ? 'bg-primary-soft' : '']"
      @click="$emit('activate')">
      <span class="coll-dot" />
      <span class="pali min-w-0 flex-1 truncate" :class="{ 'font-medium': active }">{{ conv(currentTitle) }}</span>
      <slot name="actions" />
      <button v-if="closable" class="icon-btn h-7 w-7" :aria-label="t('Close')" @click.stop="$emit('close')"><IconX class="h-4 w-4" /></button>
    </div>

    <div v-if="error" class="mx-auto max-w-reading p-8 text-center">
      <p class="mb-4 text-lg">{{ error }}</p>
      <RouterLink :to="{ name: 'home', params: { script } }" class="btn-primary">{{ t('Home') }}</RouterLink>
    </div>
    <div v-else-if="!info" class="mx-auto w-full max-w-reading space-y-3 p-8" aria-busy="true">
      <div v-for="i in 8" :key="i" class="h-4 animate-pulse rounded bg-surface2" :style="{ width: `${60 + (i * 37) % 40}%` }" />
    </div>

    <!-- groups (pitaka, nikaya ...): contents -->
    <section v-else-if="info.book < 0" class="mx-auto w-full max-w-3xl overflow-y-auto px-4 py-8">
      <h1 class="pali mb-6 text-center text-3xl font-semibold text-primary">{{ conv(info.title) }}</h1>
      <ul class="grid gap-2 sm:grid-cols-2">
        <li v-for="c in children" :key="c.key">
          <RouterLink :to="{ name: 'read', params: { script, key: c.key } }" class="card flex items-center gap-3 hover:border-primary" :class="`coll-${c.coll}`" @click="ui.navInTab = true">
            <span class="coll-dot" />
            <span class="pali flex-1">{{ conv(c.title) }}</span>
            <IconChevron class="h-4 w-4 text-muted" />
          </RouterLink>
        </li>
      </ul>
    </section>

    <div v-else :class="contained ? 'min-h-0 flex-1' : 'pb-24 pt-2'">
      <TextColumn ref="column" :node-key="tab.key" :script="script" :conv="conv" :coll="info.coll" :target="tab.target" :start="startPara"
        :highlight="tab.hl" :glosses="spans" :contained="contained" :id-prefix="contained ? `t${tab.id}-` : ''"
        @visible="onVisible" @word="(w, _s, ids, para) => $emit('word', w, glossesOf(ids), para)" @scrolled="$emit('scrolled')" @menu="(p, el) => { menu = { para: p, anchor: el } }" @loaded="onLoaded">
        <template #end>
          <nav v-if="next" class="mt-10 flex justify-end border-t border-line pt-4 font-ui text-sm">
            <RouterLink :to="{ name: 'read', params: { script, key: next.key } }" class="btn" @click="ui.navInTab = true">
              <span class="pali">{{ conv(next.title) }}</span><IconChevron class="h-4 w-4" />
            </RouterLink>
          </nav>
        </template>
      </TextColumn>
      <ParaMenu :para="menu?.para ?? null" :anchor="menu?.anchor ?? null" :links="links" @close="menu = null; column?.menuClosed()" @alongside="(k, p) => $emit('alongside', k, p)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import IconChevron from '~icons/lucide/chevron-right'
import IconX from '~icons/lucide/x'
import TextColumn from './TextColumn.vue'
import ParaMenu from './ParaMenu.vue'
import { ApiError, useApi } from '@/data/api'
import type { Gloss, Link, NodeInfo, Para, TNode } from '@/data/types'
import { glossSpans } from '@/composables/glosses'
import type { Tab } from '@/stores/tabs'
import { useScript } from '@/composables/script'
import { useUi } from '@/stores/ui'
import { t } from '@/i18n'

const props = defineProps<{ tab: Tab; contained?: boolean; active?: boolean; closable?: boolean }>()
const emit = defineEmits<{
  info: [info: NodeInfo]
  visible: [key: string, para: number, info: NodeInfo]
  word: [shown: string, glosses: Gloss[], para: { key: string; para: number }]
  scrolled: []
  alongside: [key: string, para: number | undefined]
  activate: []
  close: []
}>()

const api = useApi()
const ui = useUi()
const { script, conv } = useScript()
const info = ref<NodeInfo | null>(null)
const currentInfo = ref<NodeInfo | null>(null)
const children = ref<TNode[]>([])
const error = ref('')
const links = ref<Link[]>([])
const glosses = ref<Gloss[]>([])
const column = ref<InstanceType<typeof TextColumn>>()
const next = ref<{ key: string; title: string } | null>(null)
const menu = ref<{ para: Para; anchor: HTMLElement } | null>(null)
// restored reading position: read once per text (the tab's para follows the scrolling)
const startPara = ref(props.tab.para)
watch(() => props.tab.key, () => { startPara.value = props.tab.para })
const currentTitle = computed(() => currentInfo.value?.title ?? info.value?.title ?? '')

watch(() => props.tab.key, async k => {
  error.value = ''
  info.value = null
  links.value = []
  glosses.value = []
  try {
    const i = await api.node(k)
    if (k !== props.tab.key) return
    info.value = currentInfo.value = i
    emit('info', i)
    if (i.book < 0) children.value = await api.children(k)
    next.value = i.next ? { key: i.next, title: (await api.node(i.next)).title } : null
  } catch (e) {
    error.value = e instanceof ApiError && e.code === 'not_found' ? t('This page does not exist.') : t('Could not load the text. Please try again.')
  }
}, { immediate: true })

async function onVisible(para: number, key: string) {
  if (key !== currentInfo.value?.key) {
    try { currentInfo.value = await api.node(key) } catch { return }
  }
  if (currentInfo.value) emit('visible', key, para, currentInfo.value)
}

async function onLoaded(from: number, to: number) {
  const key = props.tab.key
  await Promise.all([
    api.links(key, from, to).then(ls => {
      if (key !== props.tab.key) return
      const seen = new Map(links.value.map(l => [`${l.i}:${l.b}:${l.t}`, l]))
      for (const l of ls) seen.set(`${l.i}:${l.b}:${l.t}`, l)
      links.value = [...seen.values()]
    }).catch(() => { /* links are optional */ }),
    api.glosses(key, from, to).then(gs => {
      if (key !== props.tab.key) return
      const seen = new Map(glosses.value.map(g => [`${g.g}${g.side}`, g]))
      for (const g of gs) seen.set(`${g.g}${g.side}`, g)
      glosses.value = [...seen.values()]
    }).catch(() => { /* older databases have no glosses */ }),
  ])
}
const spans = computed(() => glossSpans(glosses.value))
const glossesOf = (ids: number[]) => glosses.value.filter(g => ids.includes(g.g))

defineExpose({
  scrollToPara: (i: number) => column.value?.scrollToPara(i),
  /** paragraphs of another book linked from the given paragraph or the next linked one */
  linkTarget(para: number, book: number): number | undefined {
    const cands = links.value.filter(l => l.b === book && l.i >= para).sort((a, b) => a.i - b.i)
    return cands[0]?.t
  },
  book: () => info.value?.book ?? -1,
  coll: () => info.value?.coll,
  /** the scroll container of the text (columns view) */
  scrollRoot: () => column.value?.scrollRoot() ?? null,
  /** commentary / mūla nodes linked from the loaded text (for "open commentary" when the node has no mirror) */
  linkedKeys: () => [...new Set(links.value.map(l => l.k))],
})
</script>
