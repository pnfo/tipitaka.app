/**
 * Search filters.
 *  - collections (full text and title search): node keys of the collection roots (mula, atta, tika, anya) or their
 *    groups (vp, sp, ap, atta-vp ...). Default: everything except Añña.
 *  - dictionaries: settings.dicts, codes of the selected dictionaries ('dpd' + v2 codes); [] = all.
 */
import { computed } from 'vue'
import { useSettings } from '@/stores/settings'
import { useTree } from '@/stores/tree'
import type { TNode } from '@/data/types'

export const DEFAULT_COLLECTIONS = ['mula', 'atta', 'tika']
export const ALL_COLLECTIONS = ['mula', 'atta', 'tika', 'anya']

export function useCollectionFilter() {
  const settings = useSettings()
  const tree = useTree()
  /** the keys sent to the engine */
  const keys = computed(() => settings.searchFilter ?? DEFAULT_COLLECTIONS)
  const isDefault = computed(() => settings.searchFilter === null)

  /** the collections and their groups (from the tree) */
  async function load(): Promise<{ root: TNode; children: TNode[] }[]> {
    const roots = await tree.load('')
    return Promise.all(roots.map(async root => ({ root, children: await tree.load(root.key) })))
  }
  const sections = computed(() => (tree.children.get('') ?? []).map(root => ({ root, children: tree.children.get(root.key) ?? [] })))

  /** a group is selected when it or its collection is in the filter */
  const isSelected = (key: string, rootKey?: string) => keys.value.includes(key) || (!!rootKey && keys.value.includes(rootKey))

  /** store a selection of groups, written compactly (a collection whose groups are all selected is its key) */
  function setGroups(selected: Set<string>) {
    const out: string[] = []
    for (const { root, children } of sections.value) {
      if (children.length && children.every(c => selected.has(c.key))) out.push(root.key)
      else for (const c of children) if (selected.has(c.key)) out.push(c.key)
    }
    settings.searchFilter = sameSet(out, DEFAULT_COLLECTIONS) ? null : out
  }
  function selectedGroups(): Set<string> {
    const set = new Set<string>()
    for (const { root, children } of sections.value) for (const c of children) if (isSelected(c.key, root.key)) set.add(c.key)
    return set
  }
  const reset = () => { settings.searchFilter = null }
  return { keys, isDefault, load, sections, isSelected, setGroups, selectedGroups, reset }
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))
