<!-- options of a paragraph or heading (tipitaka.lk / v2): link, copy, commentary / mūla, bookmark -->
<template>
  <Floating :open="!!para" :anchor="anchor" close-only @close="$emit('close')">
    <div v-if="para" class="min-w-[230px] py-1 text-sm" data-testid="para-menu" @click="$emit('close')">
      <button class="menu-item" data-testid="menu-link" @click="copyLink"><IconShare class="h-4 w-4" />{{ t('Get a link') }}</button>
      <button class="menu-item" data-testid="menu-copy" @click="copyText"><IconCopy class="h-4 w-4" />{{ t('Copy the paragraph') }}</button>
      <template v-for="o in others" :key="o.key">
        <button class="menu-item" :class="`coll-${o.coll}`" data-testid="menu-alongside" @click="$emit('alongside', o.key, o.para)">
          <!-- the collection name is Pāḷi: in the Pāḷi script and font, within the translated sentence -->
          <IconColumns class="h-4 w-4" /><span>{{ alongside[0] }}<span class="pali pali-inline">{{ conv(COLL_NAME[o.coll]) }}</span>{{ alongside[1] }}</span>
        </button>
      </template>
      <button v-if="hasLinks" class="menu-item" data-testid="menu-commentary" @click="showLinks"><IconPanel class="h-4 w-4" />{{ t('Show the commentary here') }}</button>
      <button class="menu-item" data-testid="menu-setting" @click="showSetting"><IconMapPin class="h-4 w-4" />{{ t('Where was this taught?') }}</button>
      <button class="menu-item" data-testid="menu-bookmark" @click="toggleBookmark">
        <IconStar class="h-4 w-4" :class="{ 'fill-current text-primary': bookmarked }" />{{ bookmarked ? t('Remove the bookmark') : t('Add a bookmark') }}
      </button>
    </div>
  </Floating>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import IconShare from '~icons/lucide/share-2'
import IconCopy from '~icons/lucide/copy'
import IconColumns from '~icons/lucide/columns-2'
import IconPanel from '~icons/lucide/panel-bottom-open'
import IconStar from '~icons/lucide/star'
import IconMapPin from '~icons/lucide/map-pin'
import Floating from './Floating.vue'
import { plainText } from '@shared/markup'
import { useApi } from '@/data/api'
import type { Coll, Link, Para } from '@/data/types'
import { useScript } from '@/composables/script'
import { COLL_NAME } from '@/composables/filters'
import { useLibrary } from '@/stores/library'
import { useUi } from '@/stores/ui'
import { t } from '@/i18n'

const props = defineProps<{ para: Para | null; anchor: HTMLElement | null; links: Link[] }>()
defineEmits<{ close: []; alongside: [key: string, para: number | undefined] }>()
const api = useApi()
const library = useLibrary(), ui = useUi()
const { script, conv } = useScript()
const alongside = computed(() => t('Open {0} alongside', '\u0000').split('\u0000'))

// texts on the other side: the paragraph's links, else the commentary / mūla of its node
const others = ref<{ key: string; para?: number; coll: Coll }[]>([])
const hasLinks = computed(() => !!props.para && props.links.some(l => l.i === props.para!.i))
watch(() => props.para, async p => {
  others.value = []
  if (!p) return
  const byColl = new Map<Coll, { key: string; para?: number; coll: Coll }>()
  // per node of the other side: its first linked paragraph and how many paragraphs link (the whole explanation of
  // the paragraph is linked, a stray paragraph number only once): the best supported node of each collection wins
  const nodes = new Map<string, { para: number; n: number }>()
  for (const l of props.links.filter(l => l.i === p.i)) {
    const o = nodes.get(l.k)
    nodes.set(l.k, { para: Math.min(o?.para ?? l.t, l.t), n: (o?.n ?? 0) + 1 })
  }
  for (const [key, o] of [...nodes].sort((a, b) => b[1].n - a[1].n)) {
    try {
      const n = await api.node(key)
      if (!byColl.has(n.coll)) byColl.set(n.coll, { key, para: o.para, coll: n.coll })
    } catch { /* ignore */ }
  }
  // the commentary / mūla of the paragraph's node, or of the nearest ancestor that has one (sections often do not)
  try {
    const n = await api.node(p.k)
    const chain = [n.key, ...n.path.filter(a => a.kind !== 'group').map(a => a.key).reverse()].slice(0, 5)
    for (const k of chain) {
      const a = k === n.key ? n : await api.node(k)
      const found = [...a.commentary, ...(a.mirrorNode ? [a.mirrorNode] : [])].filter(c => !byColl.has(c.coll))
      for (const c of found) byColl.set(c.coll, { key: c.key, coll: c.coll })
      if (found.length) break
    }
  } catch { /* ignore */ }
  if (props.para === p) others.value = [...byColl.values()]
}, { immediate: true })

const bookmarked = computed(() => !!props.para && library.isBookmarked(props.para.k, props.para.i))

async function copy(text: string, done: string) {
  try {
    if (window.TipitakaNative?.share && done === t('Link copied')) window.TipitakaNative.share(text)
    else await navigator.clipboard.writeText(text)
    ui.showToast(done)
  } catch { ui.showToast(text.slice(0, 120)) }
}
function copyLink() {
  const p = props.para!
  copy(`https://tipitaka.app/${script.value}/${p.k}#p${p.i}`, t('Link copied'))
}
function copyText() {
  const p = props.para!
  copy(conv(`${p.n ? p.n + '. ' : ''}${plainText(p.t)}`), t('Paragraph copied'))
}
function showLinks() {
  const p = props.para!
  ui.openParaCommentary({ key: p.k, para: p.i })
}
function showSetting() {
  const p = props.para!
  ui.openSetting({ key: p.k, para: p.i })
}
async function toggleBookmark() {
  const p = props.para!
  const n = await api.node(p.k)
  library.toggleBookmark({ key: p.k, para: p.i, title: n.title, path: n.bookTitle ?? '' })
  ui.showToast(library.isBookmarked(p.k, p.i) ? t('Bookmark added') : t('Bookmark removed'))
}
</script>
