/** Tree drawer state: children are loaded on demand, the path of the current node is expanded. */
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { useApi } from '@/data/api'
import type { Coll, TNode } from '@/data/types'

export const useTree = defineStore('tree', () => {
  const children = reactive(new Map<string, TNode[]>()) // '' = roots
  const expanded = reactive(new Set<string>())
  const coll = ref<Coll>('mula')
  const current = ref('')

  async function load(key: string) {
    if (children.has(key)) return children.get(key)!
    const list = await useApi().children(key)
    children.set(key, list)
    return list
  }
  async function toggle(key: string) {
    if (expanded.has(key)) expanded.delete(key)
    else {
      expanded.add(key)
      await load(key)
    }
  }
  /** expand the ancestors of a node (path from the node api) and select its collection */
  async function reveal(pathKeys: string[], key: string, nodeColl: Coll) {
    current.value = key
    coll.value = nodeColl
    await load('')
    for (const k of pathKeys) {
      expanded.add(k)
      await load(k)
    }
  }
  return { children, expanded, coll, current, load, toggle, reveal }
})
