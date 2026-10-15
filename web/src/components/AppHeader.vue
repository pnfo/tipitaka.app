<template>
  <header class="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-1 border-b border-line bg-surface px-2 sm:gap-2 sm:px-3" style="padding-top: env(safe-area-inset-top)">
    <button class="icon-btn" :class="{ active: ui.treeOpen }" :aria-label="t('Contents')" :title="t('Contents')" data-testid="tree-toggle" @click="ui.treeOpen = !ui.treeOpen">
      <IconMenu class="h-5 w-5" />
    </button>
    <RouterLink :to="{ name: 'home', params: { script } }" class="mr-1 hidden shrink-0 items-center gap-2 sm:flex" aria-label="Tipiṭaka.app">
      <img :src="logo" alt="" class="h-7 w-7 rounded-full" width="28" height="28">
      <span class="hidden font-semibold tracking-tight text-primary sm:inline" style="font-family: var(--font-text)">{{ conv('Tipiṭaka') }}</span>
    </RouterLink>
    <div class="flex min-w-0 flex-1 justify-center">
      <!-- the search pages have their own box on phones -->
      <SearchBox class="w-full max-w-xl" :class="{ 'hidden sm:block': onSearchPage }" />
    </div>
    <!-- on phones the script is chosen in the settings -->
    <div class="hidden sm:block"><ScriptPicker /></div>
    <RouterLink :to="{ name: 'bookmarks', params: { script } }" class="icon-btn hidden sm:inline-flex" :aria-label="t('Bookmarks')" :title="t('Bookmarks')">
      <IconBookmark class="h-5 w-5" />
    </RouterLink>
    <RouterLink :to="{ name: 'settings', params: { script } }" class="icon-btn" :aria-label="t('Settings')" :title="t('Settings')" data-testid="settings-link">
      <IconSettings class="h-5 w-5" />
    </RouterLink>
  </header>
</template>

<script setup lang="ts">
import IconMenu from '~icons/lucide/menu'
import IconBookmark from '~icons/lucide/bookmark'
import IconSettings from '~icons/lucide/settings'
import SearchBox from './SearchBox.vue'
import ScriptPicker from './ScriptPicker.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUi } from '@/stores/ui'
import { useScript } from '@/composables/script'
import { t } from '@/i18n'

const ui = useUi()
const route = useRoute()
const onSearchPage = computed(() => route.name === 'search' || route.name === 'titles' || route.name === 'dict')
const logo = `${import.meta.env.BASE_URL}images/app-icon.png`
const { script, conv } = useScript()
</script>
