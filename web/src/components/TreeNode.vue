<template>
  <div>
    <!-- the chevron (its own button: open / close the branch) is centred on the first line of the title: its box has the
         title's padding and line height, so the row does not get taller -->
    <div class="group flex items-start rounded-md" :class="isCurrent ? 'bg-primary-soft text-primary' : 'hover:bg-surface2'" :style="{ paddingLeft: `${depth * INDENT}px` }"
      @keydown.right="node.children && !open && tree.toggle(node.key)" @keydown.left="node.children && open && tree.toggle(node.key)">
      <button v-if="node.children" class="flex w-7 shrink-0 justify-center py-1 leading-snug" data-testid="tree-toggle-branch"
        :aria-label="open ? t('Collapse') : t('Expand')" :aria-expanded="open" @click="tree.toggle(node.key)">
        <span class="flex h-[1.375em] w-7 items-center justify-center rounded-md text-fg opacity-60 transition hover:bg-line hover:text-primary hover:opacity-100">
          <IconChevron class="h-[18px] w-[18px] transition-transform" :class="{ 'rotate-90': open }" />
        </span>
      </button>
      <span v-else class="w-7 shrink-0" />
      <RouterLink :to="{ name: 'read', params: { script, key: node.key } }" class="pali min-w-0 flex-1 py-1 pr-2 leading-snug"
        :aria-current="isCurrent ? 'page' : undefined" @click="onClick">
        {{ conv(node.title) }}
      </RouterLink>
    </div>
    <!-- the children, with a guide line down from the chevron -->
    <div v-if="open && kids" class="relative">
      <span class="pointer-events-none absolute bottom-1 top-0 w-px bg-line" :style="{ left: `${depth * INDENT + 13.5}px` }" />
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
const INDENT = 14 // px per level
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
