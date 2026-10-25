<template>
  <div class="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:pt-12">
    <section class="mb-10 text-center">
      <h1 class="pali mb-2 text-4xl font-semibold text-primary sm:text-5xl">{{ conv('Tipiṭaka') }}</h1>
      <p class="text-muted">{{ t('Chaṭṭha Saṅgāyana Tipiṭaka with commentaries – in 22 scripts') }}</p>
    </section>

    <section v-if="library.history.length" class="mb-10">
      <h2 class="section-title">{{ t('Continue reading') }}</h2>
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <RouterLink v-for="h in library.history.slice(0, 4)" :key="h.key" :to="{ name: 'read', params: { script, key: h.key } }" class="card hover:border-primary" data-testid="history-item">
          <div class="pali truncate font-medium">{{ conv(h.title) }}</div>
          <div class="pali truncate text-xs text-muted">{{ conv(h.path) }}</div>
        </RouterLink>
      </div>
    </section>

    <section class="mb-10">
      <h2 class="section-title">{{ t('Tipiṭaka') }}</h2>
      <div class="grid gap-3 md:grid-cols-3">
        <div v-for="p in pitakas" :key="p.key" class="card coll-mula">
          <RouterLink :to="{ name: 'read', params: { script, key: p.key } }" class="pali mb-2 flex items-center gap-2 text-lg font-semibold hover:text-primary">
            <span class="coll-dot" />{{ conv(p.title) }}
          </RouterLink>
          <ul class="space-y-0.5 text-sm">
            <li v-for="c in kids(p.key)" :key="c.key">
              <RouterLink :to="{ name: 'read', params: { script, key: c.key } }" class="pali block truncate rounded px-1 py-0.5 hover:bg-surface2">{{ conv(c.title) }}</RouterLink>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section class="mb-10 grid gap-3 md:grid-cols-3">
      <RouterLink v-for="c in others" :key="c.key" :to="{ name: 'read', params: { script, key: c.key } }" class="card flex items-center gap-3 hover:border-primary" :class="`coll-${c.coll}`">
        <span class="coll-dot" style="width: 12px; height: 12px" />
        <div>
          <div class="pali font-semibold">{{ conv(c.title) }}</div>
          <div class="text-xs text-muted">{{ DESC[c.coll] }}</div>
        </div>
      </RouterLink>
    </section>

    <section class="mb-10">
      <h2 class="section-title">{{ t('Start with') }}</h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink v-for="s in starters" :key="s" :to="{ name: 'read', params: { script, key: s } }" class="chip pali text-sm hover:border-primary">{{ conv(titles[s] ?? s) }}</RouterLink>
      </div>
    </section>

    <!-- (not inside the apps themselves: the stores do not allow links to other stores) -->
    <section v-if="!inApp" class="mb-10" data-testid="home-apps">
      <h2 class="section-title">{{ t('Apps') }}</h2>
      <p class="mb-3 text-sm text-muted">{{ t('The same app works offline on phones, tablets and computers.') }}</p>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <a v-for="a in APPS" :key="a.name" :href="a.href" class="card flex items-center gap-3 hover:border-primary" :data-testid="`app-${a.id}`">
          <component :is="a.icon" class="h-8 w-8 shrink-0 text-primary" />
          <span class="min-w-0"><span class="block text-xs text-muted">{{ a.store }}</span><span class="block font-semibold">{{ a.name }}</span></span>
        </a>
      </div>
    </section>

    <section class="card mb-10 space-y-2" data-testid="home-contact">
      <h2 class="font-semibold">{{ t('Contact') }}</h2>
      <p class="text-sm">{{ t('Questions, suggestions and bug reports are welcome:') }}
        <a class="text-link underline" href="mailto:path.nirvana@gmail.com">path.nirvana@gmail.com</a> ·
        <a class="text-link underline" href="https://github.com/pnfo/tipitaka.app/issues">GitHub</a></p>
    </section>

    <footer class="border-t border-line pt-6 text-center text-xs text-muted">
      <RouterLink :to="{ name: 'about', params: { script } }" class="underline">{{ t('About') }}</RouterLink> ·
      <RouterLink :to="{ name: 'convert', params: { script } }" class="underline">{{ t('Pali Script Converter') }}</RouterLink> ·
      <RouterLink :to="{ name: 'names', params: { script } }" class="underline">{{ t('Places and people') }}</RouterLink> ·
      <RouterLink :to="{ name: 'map', params: { script } }" class="underline">{{ t('Map') }}</RouterLink> ·
      {{ t('Text: Vipassana Research Institute (CST)') }} · {{ t('Dictionary: DPD and others') }}
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { useHead } from '@unhead/vue'
import { isDesktopApp, isNativeApp, useApi } from '@/data/api'
import type { TNode, Coll } from '@/data/types'
import { useScript } from '@/composables/script'
import { useLibrary } from '@/stores/library'
import { useTree } from '@/stores/tree'
import { t } from '@/i18n'
import IconAndroid from '~icons/mdi/android'
import IconApple from '~icons/mdi/apple'
import IconWindows from '~icons/mdi/microsoft-windows'
import IconMac from '~icons/mdi/apple-finder'

const api = useApi()
const library = useLibrary(), tree = useTree()
const { script, conv } = useScript()
useHead({ title: '' })

const DESC = computed<Record<Coll, string>>(() => ({ mula: t('Root texts'), atta: t('Commentaries'), tika: t('Sub-commentaries'),
  anya: t('Other texts: Visuddhimagga, grammar, chronicles…') }))
const inApp = isNativeApp() || isDesktopApp()
const APPS = [
  { id: 'android', name: 'Android', store: 'Google Play', icon: IconAndroid, href: 'https://play.google.com/store/apps/details?id=app.tipitaka.main' },
  { id: 'ios', name: 'iPhone & iPad', store: 'App Store', icon: IconApple, href: 'https://apps.apple.com/app/id6824157493' },
  { id: 'windows', name: 'Windows', store: 'Microsoft Store', icon: IconWindows, href: 'https://apps.microsoft.com/detail/9nld3hjbz9bx' },
  { id: 'mac', name: 'Mac', store: 'Mac App Store', icon: IconMac, href: 'https://apps.apple.com/app/id6824157493?platform=mac' },
]
const starters = ['dn-1-1', 'dn-2-9', 'mn-1-1-1', 'mn-1-1-10', 'sn-5-12-1-1', 'kn-dhp-1', 'kn-snp-1-8', 'kn-khp-5', 'anya-vism-1']
const titles = reactive<Record<string, string>>({})

const roots = computed(() => tree.children.get('') ?? [])
const mula = computed(() => roots.value.find(r => r.coll === 'mula'))
const pitakas = computed<TNode[]>(() => (mula.value ? tree.children.get(mula.value.key) ?? [] : []))
const others = computed(() => roots.value.filter(r => r.coll !== 'mula'))
const kids = (key: string) => tree.children.get(key) ?? []

onMounted(async () => {
  const rs = await tree.load('')
  const m = rs.find(r => r.coll === 'mula')
  if (m) for (const p of await tree.load(m.key)) tree.load(p.key)
  for (const s of starters) api.node(s).then(n => { titles[s] = n.title }).catch(() => {})
})
</script>
