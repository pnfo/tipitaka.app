<!-- the mentions of a name in one book, loaded when opened: a snippet around each, linked to its paragraph.
     maybe: the mentions that may be this name or a namesake (each says which one it was taken for). -->
<template>
  <details class="mb-1" :class="`coll-${book.coll}`" data-testid="mention-book" @toggle="toggled">
    <summary class="flex cursor-pointer items-center gap-2 py-1 text-sm">
      <span class="coll-dot" /><span class="pali flex-1"><span v-if="book.group" class="text-muted">{{ conv(book.group) }} · </span>{{ conv(book.title) }}</span><span class="text-xs text-muted">{{ count }}</span>
    </summary>
    <ul class="mb-2 ml-4">
      <li v-for="(m, i) in items" :key="i" class="py-1">
        <RouterLink :to="{ name: 'read', params: { script, key: m.key }, hash: `#p${m.para}` }" class="pali block text-sm hover:text-primary" data-testid="mention">
          <span class="text-muted">…{{ conv(snip(m.pre, -70)) }}</span><mark class="rounded bg-primary-soft px-0.5 text-fg">{{ conv(plainText(m.word)) }}</mark><span class="text-muted">{{ conv(snip(m.post, 70)) }}…</span>
          <span v-if="maybe && m.slug !== slug" class="ml-1 text-xs text-muted">({{ t('taken as {0}', namesake(m.slug)) }})</span>
        </RouterLink>
      </li>
      <li v-if="loading" class="h-6 animate-pulse rounded bg-surface2" />
      <li v-if="more"><button class="text-xs underline" @click="load">{{ t('More') }}</button></li>
    </ul>
  </details>
</template>

<script setup lang="ts">
import { meaningOf } from '@/composables/names'
import { computed, ref } from 'vue'
import { plainText } from '@shared/markup'
import { useApi } from '@/data/api'
import type { Entity, MentionBook, MentionRef } from '@/data/types'
import { useScript } from '@/composables/script'
import { t } from '@/i18n'

const props = defineProps<{ slug: string; book: MentionBook; maybe?: boolean; namesakes?: Entity[] }>()
const api = useApi()
const { script, conv } = useScript()
const items = ref<MentionRef[]>([])
const loading = ref(false)
const page = ref(0)
const count = computed(() => (props.maybe ? props.book.maybe : props.book.sure))
const more = computed(() => !loading.value && items.value.length > 0 && items.value.length < count.value && items.value.length === page.value * 100)

/** a word-aligned piece of the plain text: the end (n < 0) or the start */
function snip(markup: string, n: number): string {
  const p = plainText(markup)
  if (n > 0) return p.length <= n ? p : p.slice(0, p.lastIndexOf(' ', n) > 0 ? p.lastIndexOf(' ', n) : n)
  if (p.length <= -n) return p
  const cut = p.length + n
  const sp = p.indexOf(' ', cut)
  return p.slice(sp > 0 ? sp : cut)
}
const namesake = (slug: string) => { const e = props.namesakes?.find(x => x.slug === slug); return e ? meaningOf(e) || slug : slug }

async function load() {
  loading.value = true
  try {
    const r = await api.mentions(props.slug, props.book.book, props.maybe, page.value)
    items.value.push(...r)
    page.value++
  } finally { loading.value = false }
}
function toggled(e: Event) {
  if ((e.target as HTMLDetailsElement).open && !items.value.length && !loading.value) load()
}
</script>
