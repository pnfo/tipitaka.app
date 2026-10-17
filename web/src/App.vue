<template>
  <div class="min-h-screen" :data-script="script">
    <AppHeader />
    <div class="flex pt-14">
      <!-- tree: a column on wide screens, an overlay drawer on narrow ones -->
      <aside v-if="ui.treeOpen" class="fixed bottom-0 left-0 top-14 z-30 w-[300px] max-w-[85vw] border-r border-line bg-surface lg:sticky lg:z-10 lg:h-[calc(100vh-3.5rem)] lg:shrink-0"
        data-testid="tree-drawer">
        <TreeDrawer />
      </aside>
      <div v-if="ui.treeOpen && !wide" class="fixed inset-0 top-14 z-20 bg-black" style="opacity: .35" @click="ui.treeOpen = false" />
      <main class="min-w-0 flex-1" :style="ui.panelOpen && !wide ? { paddingBottom: `${settings.sheetHeight}vh` } : undefined">
        <RouterView />
      </main>
      <StudyPanel />
    </div>
    <Transition name="fade">
      <div v-if="ui.toast" :key="ui.toast.id" class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-fg px-4 py-2 text-sm text-bg shadow-lg" role="status" data-testid="toast">
        {{ ui.toast.msg }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useHead } from '@unhead/vue'
import { useWindowSize } from '@vueuse/core'
import AppHeader from './components/AppHeader.vue'
import TreeDrawer from './components/TreeDrawer.vue'
import StudyPanel from './components/StudyPanel.vue'
import { useUi } from './stores/ui'
import { useRouter } from 'vue-router'
import { firstVisit, useSettings } from './stores/settings'
import { countryDefaults, landingPath } from './composables/country'
import { changeScript } from './router'
import { isScriptCode } from '@shared/scripts'
import { useLibrary } from './stores/library'
import { useScript } from './composables/script'
import { setUiLang } from './i18n'
import { isNativeApp, useApi } from './data/api'

const ui = useUi(), settings = useSettings(), library = useLibrary()
const router = useRouter()
const { script, info } = useScript()
const { width } = useWindowSize()
const wide = computed(() => width.value >= 1200)

useHead({ titleTemplate: t => (t ? `${t} | Tipiṭaka.app` : 'Tipiṭaka.app – Pāḷi Tipiṭaka'), htmlAttrs: { lang: computed(() => info.value.lang) } })
watch(() => settings.uiLang, l => setUiLang(l), { immediate: true })

// a new visitor: the script and interface language of their country, unless they chose one meanwhile or arrived
// through a link that names a script (composables/country.ts)
if (firstVisit && !isNativeApp()) {
  const start = { script: settings.script, uiLang: settings.uiLang }
  const linkScript = isScriptCode(landingPath.split('/')[1])
  countryDefaults().then(d => {
    if (!d) return
    if (settings.uiLang === start.uiLang) settings.uiLang = d.uiLang
    if (!linkScript && settings.script === start.script && d.script !== settings.script) changeScript(router, d.script)
  })
}

onMounted(() => {
  document.getElementById('ssr')?.remove() // server rendered text is replaced by the app
  library.migrateV2(useApi()).then(n => { if (n) ui.showToast(`${n} bookmarks imported`) })
})
</script>

<style>
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
