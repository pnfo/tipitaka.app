<!-- places and people of the suttas (server/engine/names.go, dev-docs/names.md):
     /names           the names with a setting, by type, the most frequent first
     /names/<slug>    one name: the suttas and stories taught there / by, with or about them, the names met in them -->
<template>
  <div class="mx-auto max-w-3xl px-4 pb-20 pt-6" data-testid="names-page">
    <template v-if="!slug">
      <div class="mb-4 flex items-center gap-3">
        <h1 class="flex-1 text-2xl font-semibold">{{ t('Places and people') }}</h1>
        <RouterLink :to="{ name: 'map', params: { script } }" class="chip" data-testid="names-map-link"><IconMap class="h-4 w-4" />{{ t('Map') }}</RouterLink>
      </div>
      <p class="mb-4 text-sm text-muted">{{ t('Where the suttas and the commentary stories were taught, by whom and to whom, as the texts say.') }}</p>
      <input v-model="q" type="search" class="input mb-3 w-full" :placeholder="t('Filter')" data-testid="names-filter">
      <div class="mb-4 flex flex-wrap gap-1.5">
        <button v-for="ty in TYPES" :key="ty" class="chip" :class="{ on: type === ty }" :data-testid="`names-type-${ty}`" @click="type = ty">
          {{ TYPE_LABEL[ty]() }}<span class="text-xs text-muted">{{ counts[ty] ?? 0 }}</span>
        </button>
      </div>
      <div v-if="loading" class="h-40 animate-pulse rounded bg-surface2" />
      <ul v-else class="divide-y divide-line" data-testid="names-list">
        <li v-for="e in shown" :key="e.slug">
          <RouterLink :to="{ name: 'names', params: { script, slug: e.slug } }" class="flex items-baseline gap-3 py-2 hover:text-primary">
            <span class="pali font-medium">{{ conv(e.name) }}</span>
            <span class="min-w-0 flex-1 truncate text-xs text-muted">{{ e.meaning }}</span>
            <span class="whitespace-nowrap text-xs text-muted" :title="t('suttas / stories taught there, by, to or about them · mentions')">{{ e.units ? `${e.units} · ` : '' }}{{ e.mentions }}</span>
          </RouterLink>
        </li>
      </ul>
      <p v-if="!loading && hidden > 0" class="mt-3 text-center text-xs text-muted">{{ t('{0} more: type a name to find them', hidden) }}</p>
    </template>

    <template v-else>
      <RouterLink :to="{ name: 'names', params: { script } }" class="mb-3 inline-block text-sm text-muted hover:text-primary">← {{ t('Places and people') }}</RouterLink>
      <div v-if="loading" class="h-40 animate-pulse rounded bg-surface2" />
      <div v-else-if="!info" class="py-8 text-center text-muted">{{ t('Not found') }}</div>
      <template v-else>
        <h1 class="pali mb-1 text-2xl font-semibold" data-testid="entity-name">{{ conv(info.name) }}</h1>
        <p class="mb-1 text-sm">{{ info.meaning }}</p>
        <p class="mb-4 text-xs text-muted">{{ TYPE_LABEL[info.type]() }}<template v-if="info.family"> · {{ info.family }}</template></p>
        <p v-if="info.homonyms.length" class="mb-4 text-sm" data-testid="entity-homonyms">
          {{ t('Others of this name:') }}
          <template v-for="(h, i) in info.homonyms" :key="h.slug">
            <span v-if="i">, </span><RouterLink :to="{ name: 'names', params: { script, slug: h.slug } }" class="underline hover:text-primary">{{ h.meaning || h.lemma }}</RouterLink>
          </template>
        </p>

        <!-- the place (with the places of its suttas), or where a person / people appears -->
        <!-- (a place without coordinates has no map: the places around it would suggest a location) -->
        <section v-if="showMap" class="mb-6" data-testid="entity-map">
          <h2 class="section-title">{{ info.lat !== undefined ? t('On the map') : t('Where {0} appears', conv(info.name)) }}</h2>
          <PlaceMap class="h-72 sm:h-80" :places="mapPlaces" :highlight="[info.slug]" :fit-main="info.lat !== undefined && !nearby.length" @select="openName" />
          <RouterLink v-if="info.lat !== undefined" :to="{ name: 'map', params: { script }, query: { place: info.slug } }" class="mt-1 inline-block text-xs text-muted underline hover:text-primary">
            {{ t('Open the map') }}
          </RouterLink>
        </section>

        <section v-for="g in roleGroups" :key="g.role" class="mb-6" :data-testid="`entity-${g.role}`">
          <h2 class="section-title">{{ ROLE_LABEL[g.role]() }} {{ conv(info.name) }} · {{ g.count }}</h2>
          <details v-for="b in g.books" :key="b.book" class="mb-1" :class="`coll-${b.coll}`" :open="g.count <= 30">
            <summary class="flex cursor-pointer items-center gap-2 py-1 text-sm">
              <span class="coll-dot" /><span class="pali flex-1"><span v-if="b.group" class="text-muted">{{ conv(b.group) }} · </span>{{ conv(b.book) }}</span><span class="text-xs text-muted">{{ b.items.length }}</span>
            </summary>
            <ul class="mb-2 ml-4">
              <li v-for="s in b.items" :key="s.key + s.para">
                <RouterLink :to="{ name: 'read', params: { script, key: s.key }, hash: `#p${s.para}` }" class="pali block truncate py-0.5 text-sm hover:text-primary"
                  :class="{ 'text-muted': s.src === 'inherit' }" data-testid="entity-setting">
                  {{ conv(s.title) }}
                </RouterLink>
              </li>
            </ul>
          </details>
        </section>

        <!-- every mention, by book; then those that may be a namesake -->
        <section v-if="sureBooks.length" class="mb-6" data-testid="entity-mentions">
          <h2 class="section-title">{{ t('Mentioned') }} · {{ sureTotal }}</h2>
          <MentionList v-for="b in sureBooks" :key="b.book" :slug="info.slug" :book="b" />
        </section>
        <section v-if="maybeBooks.length" class="mb-6" data-testid="entity-maybe">
          <h2 class="section-title">{{ t('{0} or a namesake', conv(info.name)) }} · {{ maybeTotal }}</h2>
          <p class="mb-1 text-xs text-muted">{{ t('Here the text does not tell the namesakes apart.') }}</p>
          <MentionList v-for="b in maybeBooks" :key="b.book" :slug="info.slug" :book="b" maybe :namesakes="[info, ...info.homonyms]" />
        </section>
        <section v-if="info.comentions.length" class="mb-6" data-testid="entity-comentions">
          <h2 class="section-title">{{ t('Often named with') }}</h2>
          <div class="flex flex-wrap gap-1.5">
            <RouterLink v-for="r in info.comentions.slice(0, 30)" :key="r.slug" :to="{ name: 'names', params: { script, slug: r.slug } }" class="chip hover:border-primary" :title="r.meaning">
              <span class="pali">{{ conv(r.name) }}</span><span class="text-xs text-muted">{{ r.count }}</span>
            </RouterLink>
          </div>
        </section>

        <section v-if="info.related.length" class="mb-6" data-testid="entity-related">
          <h2 class="section-title">{{ t('In the same suttas') }}</h2>
          <div v-for="g in related" :key="g.role" class="mb-2 flex flex-wrap items-center gap-1.5">
            <span class="mr-1 text-xs text-muted">{{ ROLE_LABEL[g.role]() }}</span>
            <RouterLink v-for="r in g.items" :key="r.slug" :to="{ name: 'names', params: { script, slug: r.slug } }" class="chip hover:border-primary" :title="r.meaning">
              <span class="pali">{{ conv(r.name) }}</span><span class="text-xs text-muted">{{ r.count }}</span>
            </RouterLink>
          </div>
        </section>

        <section class="mb-6">
          <h2 class="section-title">{{ t('Dictionary') }}</h2>
          <DictView :word="info.lemma.replace(/ [\d.]+$/, '')" mode="dict" compact />
        </section>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useHead } from '@unhead/vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IconMap from '~icons/lucide/map'
import DictView from '@/components/DictView.vue'
import PlaceMap from '@/components/PlaceMap.vue'
import MentionList from '@/components/MentionList.vue'
import { useApi } from '@/data/api'
import type { Coll, Entity, EntityInfo, EntityType, SettingRef, SettingRole } from '@/data/types'
import { toRoman, useScript } from '@/composables/script'
import { ROLE_LABEL, TYPE_LABEL, contextPlaces, isArea, mapPlace } from '@/composables/names'
import type { MapPlace } from '@/map/draw'
import { fold } from '@shared/normalize'
import { t } from '@/i18n'

const route = useRoute()
const api = useApi()
const { script, conv } = useScript()
const slug = computed(() => (route.params.slug as string | undefined) || '')

const TYPES: EntityType[] = ['place', 'person', 'group', 'deity', 'animal']
const ROLES: SettingRole[] = ['place', 'teacher', 'with', 'about']
const type = ref<EntityType>('place')
const q = ref('')
const all = ref<Entity[]>([])
const info = ref<EntityInfo | null>(null)
const loading = ref(false)

watch(slug, async s => {
  loading.value = true
  try {
    if (s) info.value = await api.entity(s).catch(() => null)
    else if (!all.value.length) all.value = await api.names()
  } finally { loading.value = false }
}, { immediate: true })

const counts = computed(() => all.value.reduce<Record<string, number>>((m, e) => ({ ...m, [e.type]: (m[e.type] ?? 0) + 1 }), {}))
const shown = computed(() => {
  const f = fold(toRoman(q.value.trim()))
  // the 300 most frequent of a type (filtering finds the others)
  return all.value.filter(e => (f ? fold(e.name).includes(f) : e.type === type.value)).slice(0, f ? 500 : 300)
})
const hidden = computed(() => (q.value.trim() ? 0 : (counts.value[type.value] ?? 0) - shown.value.length))

// the settings of the name by role, then by book (in book order)
const roleGroups = computed(() => {
  const ss = info.value?.settings ?? []
  return ROLES.map(role => {
    const books: { book: string; group: string; coll: Coll; items: SettingRef[] }[] = []
    const seen = new Set<string>()
    for (const s of ss.filter(x => x.role === role)) {
      if (seen.has(s.key + ':' + s.para)) continue
      seen.add(s.key + ':' + s.para)
      let b = books[books.length - 1]
      if (!b || b.book !== s.book || b.group !== s.group) books.push(b = { book: s.book, group: s.group, coll: s.coll, items: [] })
      b.items.push(s)
    }
    return { role, books, count: seen.size }
  }).filter(g => g.count)
})
// the map: the place itself, the places named in the same settings (sizes: in how many suttas)
const context = ref<MapPlace[]>([])
contextPlaces().then(c => { context.value = c })
// the places of its settings, and the places named with it (a commentary person without settings: where they appear)
const nearby = computed(() => {
  const out = new Map<string, Entity & { count: number }>()
  for (const r of [...(info.value?.related ?? []).filter(r => r.role === 'place'), ...(info.value?.comentions ?? []).filter(r => r.type === 'place')]) {
    if (r.lat === undefined || (r.prec ?? 1) >= 4 || isArea(r)) continue
    const o = out.get(r.slug)
    out.set(r.slug, { ...r, count: Math.max(o?.count ?? 0, r.count) })
  }
  return [...out.values()].sort((a, b) => b.count - a.count)
})
const sureBooks = computed(() => (info.value?.books ?? []).filter(b => b.sure))
const maybeBooks = computed(() => (info.value?.books ?? []).filter(b => b.maybe))
const sureTotal = computed(() => sureBooks.value.reduce((s, b) => s + b.sure, 0))
const maybeTotal = computed(() => maybeBooks.value.reduce((s, b) => s + b.maybe, 0))
const mapPlaces = computed<MapPlace[]>(() => {
  const e = info.value
  if (!e) return []
  const shown = new Set([e.slug, ...nearby.value.map(r => r.slug)])
  return [
    ...context.value.filter(c => !shown.has(c.slug)),
    ...nearby.value.map((r, i) => mapPlace(r, 'related', { count: r.count, label: i < 6 })),
    ...(e.lat !== undefined ? [mapPlace(e, 'main', { label: true })] : []),
  ]
})
const showMap = computed(() => !!info.value && (info.value.type === 'place' ? info.value.lat !== undefined : mapPlaces.value.some(p => p.kind !== 'context')))
const router = useRouter()
const openName = (s: string) => router.push({ name: 'names', params: { script: script.value, slug: s } })

const related = computed(() => ROLES.map(role => ({ role, items: (info.value?.related ?? []).filter(r => r.role === role).slice(0, 24) })).filter(g => g.items.length))

useHead({ title: computed(() => (slug.value && info.value ? conv(info.value.name) : t('Places and people'))) })
</script>
