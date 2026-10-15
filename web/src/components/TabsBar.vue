<!-- open texts: a scrollable strip of tabs with scroll buttons and a list of all tabs (tipitaka.lk style) -->
<template>
  <div class="flex h-10 items-stretch border-b border-line bg-surface" data-testid="tab-bar">
    <button v-show="overflow" class="icon-btn h-full shrink-0 rounded-none" :aria-label="t('Scroll left')" @click="scrollBy(-1)"><IconLeft class="h-4 w-4" /></button>
    <div ref="strip" class="no-scrollbar flex min-w-0 flex-1 items-end overflow-x-auto" role="tablist" @scroll="updateOverflow">
      <div v-for="tb in tabs.tabs" :key="tb.id" role="tab" :aria-selected="tb.id === tabs.activeId" :title="conv(tb.title ?? '')" :data-tab="tb.id"
        :class="['group flex h-full max-w-[220px] shrink-0 cursor-pointer items-center whitespace-nowrap border-b-2 pl-3 pr-1 text-sm', `coll-${tb.coll ?? 'mula'}`,
                 tb.id === tabs.activeId ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg']"
        data-testid="tab" @click="$emit('activate', tb.id)" @auxclick.prevent="$event.button === 1 && $emit('close', tb.id)">
        <span class="coll-dot mr-1.5" />
        <span class="pali truncate">{{ name(tb) }}</span>
        <button :class="['ml-1 rounded-full p-0.5 hover:bg-surface2', tb.id === tabs.activeId ? '' : 'opacity-0 group-hover:opacity-100 max-sm:opacity-60']"
          :aria-label="t('Close')" data-testid="tab-close" @click.stop="$emit('close', tb.id)"><IconX class="h-3.5 w-3.5" /></button>
      </div>
    </div>
    <button v-show="overflow" class="icon-btn h-full shrink-0 rounded-none" :aria-label="t('Scroll right')" @click="scrollBy(1)"><IconRight class="h-4 w-4" /></button>
    <div class="shrink-0 border-l border-line">
      <button ref="listBtn" class="icon-btn h-full w-auto rounded-none px-2" :title="t('Open texts')" data-testid="tabs-list" @click="listOpen = !listOpen">
        <IconTabs class="h-4 w-4" /><span class="ml-1 text-xs tabular-nums">{{ tabs.tabs.length }}</span>
      </button>
      <Floating :open="listOpen" :anchor="listBtn ?? null" align="end" @close="listOpen = false">
        <div class="flex max-h-[70vh] w-[min(88vw,320px)] flex-col" data-testid="tabs-list-menu">
          <div class="border-b border-line pb-1">
            <div v-if="wide" class="mb-1 flex gap-1 px-2 py-1" role="group" :aria-label="t('Tab view')">
              <button v-for="v in VIEWS" :key="v.id" class="chip flex-1 justify-center" :class="{ on: settings.tabView === v.id }" :data-testid="`view-${v.id}`"
                @click="settings.tabView = v.id">{{ v.label }}</button>
            </div>
            <button v-if="tabs.tabs.length > 1" class="menu-item" data-testid="close-other-tabs" @click="$emit('closeOthers'); listOpen = false">
              <IconCloseOthers class="h-4 w-4" />{{ t('Close the other tabs') }}
            </button>
          </div>
          <div ref="listEl" class="overflow-y-auto py-1">
            <div v-for="tb in tabs.tabs" :key="tb.id" :class="['menu-item cursor-pointer', `coll-${tb.coll ?? 'mula'}`, { 'bg-surface2 text-primary': tb.id === tabs.activeId }]"
              :data-active="tb.id === tabs.activeId" data-testid="tabs-list-item" @click="$emit('activate', tb.id); listOpen = false">
              <span class="coll-dot" />
              <span class="pali min-w-0 flex-1 truncate">{{ name(tb) }}</span>
              <button v-if="tabs.tabs.length > 1" class="rounded-full p-0.5 hover:bg-surface2" :aria-label="t('Close')" @click.stop="$emit('close', tb.id)"><IconX class="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>
      </Floating>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import IconX from '~icons/lucide/x'
import IconLeft from '~icons/lucide/chevron-left'
import IconRight from '~icons/lucide/chevron-right'
import IconTabs from '~icons/lucide/layers'
import IconCloseOthers from '~icons/lucide/copy-x'
import Floating from './Floating.vue'
import { useTabs, type Tab } from '@/stores/tabs'
import { useSettings, type TabView } from '@/stores/settings'
import { useScript } from '@/composables/script'
import { t } from '@/i18n'

defineEmits<{ activate: [id: number]; close: [id: number]; closeOthers: [] }>()
const tabs = useTabs(), settings = useSettings()
const { conv } = useScript()
const { width } = useWindowSize()
const wide = computed(() => width.value >= 900)
const VIEWS = computed<{ id: TabView; label: string }[]>(() => [{ id: 'single', label: t('Single') }, { id: 'tabbed', label: t('Tabs') }, { id: 'columns', label: t('Columns') }])
/** the sutta name without its number: "1. Brahmajālasuttaṃ" -> "Brahmajālasuttaṃ" (the key while loading) */
const name = (tb: Tab) => conv((tb.title ?? '').replace(/^[(\d\s.)-]+/, '') || tb.title || '…')

const strip = ref<HTMLElement>(), listBtn = ref<HTMLElement>(), listEl = ref<HTMLElement>()
const overflow = ref(false), listOpen = ref(false)
function updateOverflow() { const el = strip.value; overflow.value = !!el && el.scrollWidth > el.clientWidth + 2 }
function scrollBy(dir: number) { strip.value?.scrollBy({ left: dir * strip.value.clientWidth * 0.7, behavior: 'smooth' }) }
async function revealActive() {
  await nextTick()
  updateOverflow()
  strip.value?.querySelector(`[data-tab="${tabs.activeId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
watch(() => [tabs.activeId, tabs.tabs.length], revealActive)
watch(listOpen, async o => { if (o) { await nextTick(); listEl.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }) } })
onMounted(() => { revealActive(); window.addEventListener('resize', updateOverflow) })
onBeforeUnmount(() => window.removeEventListener('resize', updateOverflow))
</script>

<style scoped>
.no-scrollbar { scrollbar-width: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
</style>
