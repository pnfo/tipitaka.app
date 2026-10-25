/**
 * The columns of wide screens (≥ 1200 px): the contents on the left, the study panel and the menu on the right. The
 * menu is a column when it is pinned and the text keeps MIN_TEXT px next to the open columns (else the study panel
 * wins the room); otherwise the menu opens over the page (ui.navOpen).
 */
import { computed } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { useUi } from '@/stores/ui'
import { useSettings } from '@/stores/settings'

export const WIDE = 1200
const TREE_WIDTH = 300, PANEL_WIDTH = 400, MIN_TEXT = 680
export const NAV_WIDTH = 272

export function useLayout() {
  const { width } = useWindowSize()
  const ui = useUi(), settings = useSettings()
  const wide = computed(() => width.value >= WIDE)
  /** there is room for the menu as a column */
  const navFits = computed(() => wide.value && width.value - (ui.treeOpen ? TREE_WIDTH : 0) - (ui.panelOpen ? PANEL_WIDTH : 0) - NAV_WIDTH >= MIN_TEXT)
  const navColumn = computed(() => settings.navPinned && navFits.value)
  /** the menu button: closes the menu (a column is unpinned), or opens it over the page */
  function toggleNav() {
    if (navColumn.value) settings.navPinned = false
    else ui.navOpen = !ui.navOpen
    if (ui.navOpen && !wide.value) ui.treeOpen = false
  }
  function toggleTree() {
    ui.treeOpen = !ui.treeOpen
    if (ui.treeOpen && !wide.value) ui.navOpen = false
  }
  return { width, wide, navFits, navColumn, toggleNav, toggleTree }
}
