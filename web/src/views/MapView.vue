<!-- /<script>/map: every place a sutta or a commentary story was taught at (circle size: their number), the
     mahājanapadas, the great rivers, and two journeys. ?place=<slug> selects a place, ?journey=<id> draws a journey. -->
<template>
  <div class="relative isolate" style="height: calc(100vh - 3.5rem)" data-testid="map-page">
    <PlaceMap class="h-full !rounded-none !border-0" no-fit :focus="placeSlug" :places="places" :highlight="selected ? [selected.slug] : []" :journey="journeyId"
      @select="select" @journey="j => (journey = j)" />

    <!-- the journeys -->
    <!-- (in a row next to the zoom buttons, stopping short of the layer switch; on narrow screens one under the other,
         below the zoom buttons) -->
    <div class="absolute left-2 top-[5.25rem] z-[700] flex max-w-[calc(100%-1rem)] flex-col items-start gap-1.5 sm:left-14 sm:right-48 sm:top-2.5 sm:flex-row sm:overflow-x-auto">
      <button v-for="j in JOURNEYS" :key="j.id" class="chip shrink-0 whitespace-nowrap text-xs shadow-sm" :class="{ on: journeyId === j.id }" :data-testid="`map-journey-${j.id}`"
        @click="setQuery({ journey: journeyId === j.id ? undefined : j.id, place: undefined })">
        {{ j.title() }}
      </button>
    </div>

    <!-- the selected place, or the journey's stages -->
    <div v-if="selected || journey" class="absolute inset-x-2 bottom-6 z-[700] max-h-[45%] overflow-y-auto rounded-xl border border-line bg-surface p-3 text-sm shadow-xl sm:inset-x-auto sm:left-3 sm:w-80"
      data-testid="map-card">
      <button class="icon-btn float-right -mr-1 -mt-1" :aria-label="t('Close')" @click="setQuery({ place: undefined, journey: undefined })"><IconX class="h-4 w-4" /></button>
      <template v-if="selected">
        <RouterLink :to="{ name: 'names', params: { script, slug: selected.slug } }" class="pali text-lg font-semibold hover:text-primary" data-testid="map-card-name">
          {{ conv(selected.name) }}
        </RouterLink>
        <p class="mb-2 text-xs text-muted">{{ meaningOf(selected) }}</p>
        <div v-if="info" class="mb-1 section-title">{{ t('Taught here') }} · {{ info.units }}</div>
        <ul v-if="info">
          <li v-for="s in taughtHere" :key="s.key + s.para">
            <RouterLink :to="{ name: 'read', params: { script, key: s.key }, hash: `#p${s.para}` }" class="pali block truncate py-0.5 hover:text-primary" :class="`coll-${s.coll}`">
              <span class="coll-dot mr-1.5" />{{ conv(s.title) }}
            </RouterLink>
          </li>
        </ul>
        <RouterLink v-if="info && info.units > taughtHere.length" :to="{ name: 'names', params: { script, slug: selected.slug } }" class="mt-1 inline-block text-xs underline">
          {{ t('All {0}', info.units) }}
        </RouterLink>
      </template>
      <template v-else-if="journey">
        <RouterLink :to="{ name: 'read', params: { script, key: journey.key } }" class="font-semibold hover:text-primary">{{ JOURNEYS.find(j => j.id === journey!.id)?.title() }}</RouterLink>
        <p class="mb-2 text-xs text-muted">{{ t('About {0} km in a straight line (≈ {1} yojanas)', journey.total, Math.round(journey.total / YOJANA_KM)) }}</p>
        <ol data-testid="map-journey-stops">
          <li v-for="(s, i) in journey.stops" :key="i" class="flex items-baseline gap-2 py-0.5">
            <span class="w-5 text-right text-xs text-muted">{{ i + 1 }}</span>
            <RouterLink v-if="s.slug" :to="{ name: 'names', params: { script, slug: s.slug } }" class="pali flex-1 hover:text-primary">{{ conv(s.name) }}</RouterLink>
            <span v-else class="pali flex-1">{{ conv(s.name) }}</span>
            <span v-if="i" class="text-xs text-muted">+{{ s.km }} km</span>
          </li>
        </ol>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useHead } from '@unhead/vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IconX from '~icons/lucide/x'
import PlaceMap from '@/components/PlaceMap.vue'
import { useApi } from '@/data/api'
import type { Entity, EntityInfo } from '@/data/types'
import type { JourneyInfo, MapPlace } from '@/map/draw'
import { YOJANA_KM } from '@/map/geo'
import { JOURNEYS, isArea, locatedPlaces, mapPlace, meaningOf } from '@/composables/names'
import { useScript } from '@/composables/script'
import { t, uiLang } from '@/i18n'

const route = useRoute(), router = useRouter()
const api = useApi()
const { script, conv } = useScript()
const all = ref<Entity[]>([])
const info = ref<EntityInfo | null>(null)
const journey = ref<JourneyInfo | null>(null)

// (again in another interface language: the descriptions)
watch(uiLang, () => locatedPlaces().then(es => { all.value = es.filter(e => e.type === 'place') }), { immediate: true })

const placeSlug = computed(() => (typeof route.query.place === 'string' ? route.query.place : ''))
const journeyId = computed(() => (typeof route.query.journey === 'string' && JOURNEYS.some(j => j.id === route.query.journey) ? route.query.journey : null))
const selected = computed(() => all.value.find(e => e.slug === placeSlug.value) ?? null)
// every place, the circle by its number of suttas; the 14 most frequent always named
// (places only known to be "in or near" another one would sit on it: not drawn, unless selected)
// (countries are regions on the map, not points)
const places = computed<MapPlace[]>(() => all.value.filter(e => ((e.prec ?? 1) < 4 && !isArea(e)) || e.slug === placeSlug.value).map((e, i) => mapPlace(e, e.slug === placeSlug.value ? 'main' : 'related',
  { count: e.units, label: i < 14 || e.slug === placeSlug.value })))

watch([placeSlug, uiLang], async ([s]) => {
  info.value = null
  if (s) info.value = await api.entity(s).catch(() => null)
}, { immediate: true })
watch(journeyId, j => { if (!j) journey.value = null })
const taughtHere = computed(() => {
  const seen = new Set<string>()
  return (info.value?.settings ?? []).filter(s => s.role === 'place' && !seen.has(s.key + s.para) && !!seen.add(s.key + s.para)).slice(0, 8)
})

function setQuery(q: Record<string, string | undefined>) {
  router.replace({ query: { ...route.query, ...q } })
}
function select(slug: string) {
  if (all.value.some(e => e.slug === slug)) setQuery({ place: slug, journey: undefined })
  else router.push({ name: 'names', params: { script: script.value, slug } })
}

useHead({ title: computed(() => (selected.value ? `${conv(selected.value.name)} – ${t('Map')}` : t('Map'))) })
</script>
