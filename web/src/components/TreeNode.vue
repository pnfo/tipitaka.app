<template>
  <div>
    <div class="group flex items-start rounded-md" :class="isCurrent ? 'bg-primary-soft text-primary' : 'hover:bg-surface2'" :style="{ paddingLeft: `${depth * 12}px` }">
      <button v-if="node.children" class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:text-fg"
        :aria-label="open ? t('Collapse') : t('Expand')" :aria-expanded="open" @click="tree.toggle(node.key)">
        <IconChevron class="h-3.5 w-3.5 transition-transform" :class="{ 'rotate-90': open }" />
      </button>
      <span v-else class="w-6 shrink-0" />
      <RouterLink :to="{ name: 'read', params: { script, key: node.key } }" class="pali min-w-0 flex-1 py-1 pr-2 leading-snug"
        :aria-current="isCurrent ? 'page' : undefined" @click="onClick">
        {{ conv(node.title) }}
      </RouterLink>
    </div>
    <div v-if="open && kids">
      <TreeNode v-for="c in kids" :key="c.key" :node="c" :depth="depth + 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWindowSize } from '@vueuse/core'
import IconChevron from '~icons/lucide/chevron-right'
import type { TNode } from '@/data/types'
import { useTree } from '@/stores/tree'
import { useUi } from '@/stores/ui'
import { useScript } from '@/composables/script'
import { t } from '@/i18n'

const props = defineProps<{ node: TNode; depth: number }>()
const tree = useTree(), ui = useUi()
const { script, conv } = useScript()
const { width } = useWindowSize()
const open = computed(() => tree.expanded.has(props.node.key))
const kids = computed(() => tree.children.get(props.node.key))
const isCurrent = computed(() => tree.current === props.node.key)

function onClick() {
  if (props.node.children && !open.value) tree.toggle(props.node.key)
  if (width.value < 1200 && (!props.node.children || props.node.kind !== 'group')) ui.treeOpen = false
}
</script>
