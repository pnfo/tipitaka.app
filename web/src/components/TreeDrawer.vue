<template>
  <nav class="flex h-full flex-col" :aria-label="t('Contents')">
    <div class="flex gap-1 border-b border-line p-2" role="tablist">
      <button v-for="c in roots" :key="c.key" role="tab" :aria-selected="tree.coll === c.coll"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-1.5 text-[0.8125rem] font-medium" :class="[`coll-${c.coll}`, tree.coll === c.coll ? 'bg-surface2 text-fg' : 'text-muted hover:bg-surface2']"
        :data-testid="`tree-tab-${c.coll}`" @click="tree.coll = c.coll">
        <span class="coll-dot" />
        <span class="pali truncate">{{ conv(COLL_NAME[c.coll]) }}</span>
      </button>
    </div>
    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-2 text-base" data-testid="tree">
      <template v-if="rootNode">
        <TreeNode v-for="n in tree.children.get(rootNode.key) ?? []" :key="n.key" :node="n" :depth="0" />
      </template>
      <div v-else class="p-3 text-muted">{{ t('Loading…') }}</div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import TreeNode from './TreeNode.vue'
import { useTree } from '@/stores/tree'
import { useScript } from '@/composables/script'
import { COLL_NAME } from '@/composables/filters'
import { t } from '@/i18n'

const tree = useTree()
const { conv } = useScript()
const scroller = ref<HTMLElement>()

const roots = computed(() => (tree.children.get('') ?? []).map(n => ({ key: n.key, coll: n.coll })))
const rootNode = computed(() => (tree.children.get('') ?? []).find(n => n.coll === tree.coll))

onMounted(async () => {
  const list = await tree.load('')
  await Promise.all(list.map(n => tree.load(n.key)))
})
watch(() => tree.coll, async c => {
  const r = (tree.children.get('') ?? []).find(n => n.coll === c)
  if (r) await tree.load(r.key)
})
// keep the current node in view
watch(() => tree.current, async () => {
  await nextTick()
  setTimeout(() => scroller.value?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'center' }), 50)
})
</script>
