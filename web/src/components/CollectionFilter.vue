<!--
  Filter button + dialog for the collections searched (full text and titles): each collection (Mūla, Aṭṭhakathā,
  Ṭīkā, Añña) with its groups (Vinaya / Sutta / Abhidhamma ...), names in the current script.
-->
<template>
  <button class="btn h-10 shrink-0 px-3" :class="{ 'border-primary text-primary': !isDefault }" :title="t('Collections to search')" data-testid="collection-filter" @click="openDialog">
    <IconFilter class="h-4 w-4" />
    <span class="hidden sm:inline">{{ t('Filter') }}</span>
    <span v-if="!isDefault" class="rounded-full bg-primary px-1.5 text-[0.6875rem] text-white" data-testid="filter-badge">{{ keys.length }}</span>
  </button>
  <Dialog :open="open" :title="t('Collections to search')" testid="collection-dialog" @close="open = false">
    <div class="space-y-4">
      <section v-for="s in sections" :key="s.root.key" :class="`coll-${s.root.coll}`">
        <label class="mb-1.5 flex cursor-pointer items-center gap-2 font-medium">
          <input type="checkbox" class="h-4 w-4" :checked="state(s) === 'all'" :indeterminate="state(s) === 'some'" :data-testid="`coll-${s.root.key}`" @change="toggleRoot(s)">
          <span class="coll-dot" /><span class="pali">{{ conv(s.root.title) }}</span>
        </label>
        <div class="grid grid-cols-1 gap-x-4 gap-y-1 pl-6 sm:grid-cols-2">
          <label v-for="c in s.children" :key="c.key" class="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" class="h-4 w-4" :checked="selected.has(c.key)" :data-testid="`coll-${c.key}`" @change="toggle(c.key)">
            <span class="pali">{{ conv(c.title) }}</span>
          </label>
        </div>
      </section>
    </div>
    <template #footer>
      <button class="btn" data-testid="filter-all" @click="setAll">{{ t('All') }}</button>
      <button class="btn" data-testid="filter-default" @click="reset(); sync()">{{ t('Default') }}</button>
      <span class="flex-1 text-right text-xs text-error">{{ selected.size ? '' : t('Select at least one') }}</span>
      <button class="btn-primary" :disabled="!selected.size" data-testid="filter-done" @click="open = false">{{ t('Done') }}</button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import IconFilter from '~icons/lucide/list-filter'
import Dialog from './Dialog.vue'
import { useCollectionFilter } from '@/composables/filters'
import { useScript } from '@/composables/script'
import type { TNode } from '@/data/types'
import { t } from '@/i18n'

const { keys, isDefault, load, sections, setGroups, selectedGroups, reset } = useCollectionFilter()
const { conv } = useScript()
const open = ref(false)
const selected = ref(new Set<string>())

const sync = () => { selected.value = selectedGroups() }
async function openDialog() {
  await load()
  sync()
  open.value = true
}
function apply() {
  if (selected.value.size) setGroups(selected.value) // never search nothing
}
function toggle(key: string) {
  const s = new Set(selected.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  selected.value = s
  apply()
}
type Section = { root: TNode; children: TNode[] }
const state = (s: Section) => {
  const n = s.children.filter(c => selected.value.has(c.key)).length
  return n === 0 ? 'none' : n === s.children.length ? 'all' : 'some'
}
function toggleRoot(s: Section) {
  const on = state(s) !== 'all'
  const set = new Set(selected.value)
  for (const c of s.children) {
    if (on) set.add(c.key)
    else set.delete(c.key)
  }
  selected.value = set
  apply()
}
function setAll() {
  selected.value = new Set(sections.value.flatMap(s => s.children.map(c => c.key)))
  apply()
}
</script>
