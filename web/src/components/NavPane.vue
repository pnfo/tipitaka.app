<!--
  The menu (as on tipitaka.lk): the pages, the common settings (Pāḷi script, interface language, colours, text size)
  and the link to all the settings. Over the page from the right (the ⋮ button of the header), or on wide screens a
  column that stays open (pinned) when the text keeps enough room (composables/layout.ts).
-->
<template>
  <div v-if="overlay" class="fixed inset-0 top-14 z-40 bg-black" style="opacity: .35" @click="ui.navOpen = false" />
  <aside v-if="column || overlay" :class="column ? 'sticky top-14 h-[calc(100vh-3.5rem)] shrink-0 border-l' : 'fixed bottom-0 right-0 top-14 z-40 max-w-[85vw] border-l shadow-2xl'"
    class="overflow-y-auto overscroll-contain border-line bg-surface" :style="{ width: `${NAV_WIDTH}px` }" :aria-label="t('Menu')" data-testid="nav-pane">
    <div class="flex items-center gap-1 border-b border-line py-1.5 pl-3 pr-1.5">
      <span class="flex-1 truncate font-semibold text-primary" style="font-family: var(--font-text)">{{ conv('Tipiṭaka') }}</span>
      <button v-if="overlay && navFits" class="icon-btn text-muted" :title="t('Keep open')" :aria-label="t('Keep open')" data-testid="nav-pin" @click="pin"><IconPin class="h-4 w-4" /></button>
      <button ref="closeBtn" class="icon-btn" :title="t('Close')" :aria-label="t('Close')" data-testid="nav-close" @click="close"><IconX class="h-5 w-5" /></button>
    </div>

    <nav class="border-b border-line p-1.5">
      <RouterLink v-for="p in pages" :key="p.name" :to="{ name: p.name, params: { script } }" class="menu-item" :class="{ 'bg-primary-soft text-primary': active(p.name) }"
        :aria-current="active(p.name) ? 'page' : undefined" :data-testid="`nav-${p.name}`">
        <component :is="p.icon" class="h-5 w-5 shrink-0 text-muted" />{{ p.label }}
      </RouterLink>
    </nav>

    <section class="space-y-3 border-b border-line px-3 py-3 text-sm">
      <div class="flex items-center gap-2">
        <span class="flex-1">{{ t('Pali script') }}</span>
        <ScriptPicker />
      </div>
      <div class="flex items-center gap-2">
        <span class="flex-1">{{ t('Interface language') }}</span>
        <LanguagePicker />
      </div>
      <div>{{ t('Appearance') }}</div>
      <div class="!mt-1.5 flex items-center justify-between">
        <button v-for="th in themes" :key="th.id" class="h-8 w-8 shrink-0 rounded-full border" :class="settings.theme === th.id ? 'border-primary ring-2 ring-primary' : 'border-line'"
          :style="{ background: th.bg }" :title="th.label" :aria-label="th.label" :aria-pressed="settings.theme === th.id" :data-testid="`nav-theme-${th.id}`" @click="settings.theme = th.id" />
      </div>
      <div class="flex items-center gap-2">
        <span class="flex-1">{{ t('Text size') }}</span>
        <button class="icon-btn border border-line" :aria-label="t('Smaller')" :title="t('Smaller')" :disabled="settings.textSize <= MIN_SIZE" data-testid="nav-text-smaller"
          @click="textSize(-1)"><IconMinus class="h-4 w-4" /></button>
        <span class="w-7 text-center tabular-nums text-muted" data-testid="nav-text-size">{{ settings.textSize }}</span>
        <button class="icon-btn border border-line" :aria-label="t('Larger')" :title="t('Larger')" :disabled="settings.textSize >= MAX_SIZE" data-testid="nav-text-larger"
          @click="textSize(1)"><IconPlus class="h-4 w-4" /></button>
      </div>
    </section>

    <nav class="p-1.5">
      <RouterLink v-for="p in more" :key="p.name" :to="{ name: p.name, params: { script } }" class="menu-item" :class="{ 'bg-primary-soft text-primary': active(p.name) }"
        :aria-current="active(p.name) ? 'page' : undefined" :data-testid="`nav-${p.name}`">
        <component :is="p.icon" class="h-5 w-5 shrink-0 text-muted" />{{ p.label }}
      </RouterLink>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import IconX from '~icons/lucide/x'
import IconPin from '~icons/lucide/pin'
import IconMinus from '~icons/lucide/minus'
import IconPlus from '~icons/lucide/plus'
import IconHome from '~icons/lucide/house'
import IconBookmark from '~icons/lucide/bookmark'
import IconUsers from '~icons/lucide/users'
import IconMap from '~icons/lucide/map'
import IconConvert from '~icons/lucide/arrow-left-right'
import IconSettings from '~icons/lucide/settings'
import IconHelp from '~icons/lucide/circle-question-mark'
import IconInfo from '~icons/lucide/info'
import ScriptPicker from './ScriptPicker.vue'
import LanguagePicker from './LanguagePicker.vue'
import { useUi } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { NAV_WIDTH, useLayout } from '@/composables/layout'
import { useThemes } from '@/composables/themes'
import { useScript } from '@/composables/script'
import { t } from '@/i18n'

const ui = useUi(), settings = useSettings()
const route = useRoute()
const { script, conv } = useScript()
const { navColumn: column, navFits } = useLayout()
const overlay = computed(() => !column.value && ui.navOpen)
const themes = useThemes()

const pages = computed(() => [
  { name: 'home', label: t('Home'), icon: IconHome },
  { name: 'bookmarks', label: t('Bookmarks'), icon: IconBookmark },
  { name: 'names', label: t('Places and people'), icon: IconUsers },
  { name: 'map', label: t('Map'), icon: IconMap },
  { name: 'convert', label: t('Pali Script Converter'), icon: IconConvert },
])
const more = computed(() => [
  { name: 'settings', label: t('More settings'), icon: IconSettings },
  { name: 'help', label: t('Help'), icon: IconHelp },
  { name: 'about', label: t('About'), icon: IconInfo },
])
const active = (name: string) => route.name === name

// the same range as the slider of the settings
const MIN_SIZE = 12, MAX_SIZE = 32
const textSize = (d: number) => { settings.textSize = Math.min(MAX_SIZE, Math.max(MIN_SIZE, settings.textSize + d)) }

function pin() { settings.navPinned = true; ui.navOpen = false }
function close() { if (column.value) settings.navPinned = false; else ui.navOpen = false }

// the menu over the page closes when a page is chosen, with Escape, and when it becomes a column
watch(() => route.fullPath, () => { ui.navOpen = false })
watch(column, c => { if (c) ui.navOpen = false })
useEventListener(document, 'keydown', e => { if (e.key === 'Escape' && overlay.value) ui.navOpen = false })
// keyboard users start inside the menu
const closeBtn = ref<HTMLElement | null>(null)
watch(overlay, async o => { if (o) { await nextTick(); closeBtn.value?.focus() } })
</script>
