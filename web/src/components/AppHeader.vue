<!-- the top bar: contents | home | search | back to the text (on other pages) | the menu (pages and settings: NavPane.vue) -->
<template>
  <header class="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-1 border-b border-line bg-surface px-2 transition-transform sm:gap-2 sm:px-3"
    :class="{ '-translate-y-full': ui.headerHidden }" style="padding-top: env(safe-area-inset-top)">
    <button class="icon-btn" :class="{ active: ui.treeOpen }" :aria-label="t('Contents')" :title="t('Contents')" :aria-expanded="ui.treeOpen" data-testid="tree-toggle" @click="toggleTree">
      <IconContents class="h-5 w-5" />
    </button>
    <RouterLink :to="{ name: 'home', params: { script } }" class="mr-1 hidden shrink-0 items-center gap-2 sm:flex" :aria-label="t('Home')" :title="t('Home')">
      <img :src="logo" alt="" class="h-7 w-7 rounded-full" width="28" height="28">
      <span class="hidden font-semibold tracking-tight text-primary sm:inline" style="font-family: var(--font-text)">{{ conv('Tipiṭaka') }}</span>
    </RouterLink>
    <div class="flex min-w-0 flex-1 justify-center">
      <!-- the search pages have their own box on phones -->
      <SearchBox class="w-full max-w-xl" :class="{ 'hidden sm:block': onSearchPage }" />
    </div>
    <!-- from any other page back to the text being read (the active tab) -->
    <RouterLink v-if="backTo" :to="backTo.to" class="icon-btn" :aria-label="backTo.label" :title="backTo.label" data-testid="back-to-text">
      <IconBook class="h-5 w-5" />
    </RouterLink>
    <button class="icon-btn" :class="{ active: navShown }" :aria-label="t('Menu')" :title="t('Menu')" :aria-expanded="navShown" data-testid="nav-toggle" @click="toggleNav">
      <IconMenu class="h-5 w-5" />
    </button>
  </header>
</template>

<script setup lang="ts">
import IconContents from '~icons/lucide/menu'
import IconMenu from '~icons/lucide/ellipsis-vertical'
import IconBook from '~icons/lucide/book-open'
import SearchBox from './SearchBox.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUi } from '@/stores/ui'
import { useTabs } from '@/stores/tabs'
import { useLayout } from '@/composables/layout'
import { useScript } from '@/composables/script'
import { t } from '@/i18n'

const ui = useUi(), tabs = useTabs()
const route = useRoute()
const { script, conv } = useScript()
const { navColumn, toggleNav, toggleTree } = useLayout()
const navShown = computed(() => navColumn.value || ui.navOpen)
const onSearchPage = computed(() => route.name === 'search' || route.name === 'titles' || route.name === 'dict')
const backTo = computed(() => {
  const tb = tabs.active
  if (!tb || route.name === 'read') return null
  return { label: `${t('Back to the text')}: ${conv(tb.title ?? tb.current)}`,
    to: { name: 'read', params: { script: script.value, key: tb.current }, hash: tb.para !== undefined ? `#p${tb.para}` : '' } }
})
const logo = `${import.meta.env.BASE_URL}images/app-icon.png`
</script>
