<!-- popover positioned next to an anchor element (menus, notes, pickers) -->
<template>
  <Teleport to="body">
    <div v-if="open && anchor" ref="box" class="fixed z-50 rounded-xl border border-line bg-surface p-2 text-fg shadow-xl" :style="style" role="dialog">
      <slot />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps<{ open: boolean; anchor: HTMLElement | null; align?: 'start' | 'end'; maxWidth?: number }>()
const emit = defineEmits<{ close: [] }>()
const box = ref<HTMLElement>()
const style = ref<Record<string, string>>({ left: '0px', top: '0px', visibility: 'hidden' })

function position() {
  if (!props.anchor || !box.value) return
  const a = props.anchor.getBoundingClientRect(), b = box.value.getBoundingClientRect()
  const vw = window.innerWidth, vh = window.innerHeight
  let top = a.bottom + 6
  if (top + b.height > vh - 6) top = Math.max(6, a.top - b.height - 6)
  let left = props.align === 'end' ? a.right - b.width : a.left
  left = Math.max(6, Math.min(left, vw - b.width - 6))
  style.value = { left: `${left}px`, top: `${top}px`, visibility: 'visible', maxWidth: `${Math.min(props.maxWidth ?? 460, vw - 12)}px`, maxHeight: `${vh - 24}px`, overflow: 'auto' }
}
function onDocClick(e: Event) {
  const t = e.target as Node
  if (box.value?.contains(t) || props.anchor?.contains(t)) return
  emit('close')
}
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
const onScroll = () => position()
function detach() {
  document.removeEventListener('click', onDocClick, true)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onScroll)
}
watch(() => [props.open, props.anchor], async ([open]) => {
  detach()
  if (open) {
    style.value = { ...style.value, visibility: 'hidden' }
    await nextTick()
    position()
    setTimeout(() => { if (props.open) document.addEventListener('click', onDocClick, true) })
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
  }
}, { immediate: true })
onBeforeUnmount(detach)
</script>
