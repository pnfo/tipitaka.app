<!-- a map of places (web/src/map/draw.ts, loaded on first use): the places of a page, an optional journey, a
     highlighted region or river. Emits select(slug) when a place is tapped. The map is its own stacking context
     (isolate): Leaflet's panes never cover the menus of the page. -->
<template>
  <div class="relative isolate overflow-hidden rounded-lg border border-line" data-testid="place-map">
    <div ref="el" class="h-full w-full" />
    <div v-if="failed" class="absolute inset-0 flex items-center justify-center text-sm text-muted">{{ t('The map could not be loaded.') }}</div>
    <!-- the base: the drawn map (offline), today's map, the satellite view (online) -->
    <div v-if="!compact" class="absolute right-2 top-2 z-[1000] flex overflow-hidden rounded-full border border-line bg-surface text-xs shadow-sm" role="radiogroup"
      :aria-label="t('Map layer')" data-testid="map-base">
      <button v-for="b in BASES" :key="b.id" class="px-2.5 py-1" :class="base === b.id ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:bg-surface2'"
        role="radio" :aria-checked="base === b.id" :title="b.title()" :data-testid="`map-base-${b.id}`" @click="base = b.id">
        {{ b.label() }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import type { JourneyInfo, MapBase, MapPlace, PlaceMap } from '@/map/draw'
import { useScript } from '@/composables/script'
import { t } from '@/i18n'

const props = defineProps<{
  places: MapPlace[]
  /** slugs of regions / rivers to outline */
  highlight?: string[]
  journey?: string | null
  /** draw the journey told by this text (DN 16, Sn 5), if any */
  journeyKey?: string
  compact?: boolean
  /** fit the view to the main places (else the related ones too) */
  fitMain?: boolean
  /** never fit to the places (the map page: it opens on the middle country, or on focus) */
  noFit?: boolean
  /** centre this place, zoomed in (when it is among the places) */
  focus?: string
}>()
const emit = defineEmits<{ select: [slug: string]; journey: [info: JourneyInfo | null] }>()
const { script, conv } = useScript()
const el = ref<HTMLElement | null>(null)
const map = shallowRef<PlaceMap | null>(null)
const failed = ref(false)

const BASES: { id: MapBase; label: () => string; title: () => string }[] = [
  { id: 'drawn', label: () => t('Map'), title: () => t('The places of the texts on a drawn map (works offline)') },
  { id: 'today', label: () => t('Today'), title: () => t('Today’s towns and roads (OpenStreetMap, needs a connection)') },
  { id: 'satellite', label: () => t('Satellite'), title: () => t('The satellite view (Sentinel-2, needs a connection)') },
]
// the reader's choice, on this device (compact maps stay drawn)
const stored = useLocalStorage<MapBase>('tipitaka-map-base', 'drawn')
const base = ref<MapBase>(props.compact ? 'drawn' : stored.value)
watch(base, b => { if (!props.compact) stored.value = b; map.value?.setBase(b) })

// the map's own texts in the interface language (names of sources and licences stay as they are)
const link = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`
const texts = () => ({
  sources: t('Sources of the map'),
  sourcesHtml: [
    `${t('Places, mahājanapadas, journeys')}: ${link('https://suttacentral.net/map', 'SuttaCentral')} (CC0), DPPN`,
    `${t('Coast, rivers, mountains, relief, borders')}: ${link('https://www.naturalearthdata.com', 'Natural Earth')} (${t('public domain')})`,
    `${t('Names')}: ${link('https://digitalpalidictionary.github.io', 'DPD')}, DPPN (Malalasekera, ${t('revised by {0}', 'Ānandajoti')}, CC BY-SA)`,
    `${t('Map')}: ${link('https://leafletjs.com', 'Leaflet')}`,
  ].join('<br>'),
  approx: t('approximate location'),
  near: t('in or near this place'),
})

function fit() {
  const m = map.value
  if (!m || props.noFit || props.journey || m.hasJourney()) return
  const main = props.places.filter(p => p.kind === 'main')
  const shown = props.fitMain && main.length ? main : props.places.filter(p => p.kind !== 'context')
  m.fit(shown.length ? shown : main, props.compact ? 7 : 9)
}
// the focus is centred once its place is known (the places may come after the map)
let focused = ''
function focusPlace() {
  const p = props.focus && props.places.find(x => x.slug === props.focus)
  if (!p || !map.value || focused === props.focus) return
  focused = props.focus!
  map.value.focusOn(p.lat, p.lon)
}

onMounted(async () => {
  try {
    const { PlaceMap, journeyFor } = await import('@/map/draw')
    if (!el.value) return
    map.value = new PlaceMap(el.value, { conv, compact: props.compact, texts: texts(), onSelect: slug => emit('select', slug) })
    map.value.setBase(base.value)
    map.value.setPlaces(props.places)
    map.value.highlight(props.highlight ?? [])
    emit('journey', map.value.setJourney(props.journey ?? (props.journeyKey ? journeyFor(props.journeyKey) : null)))
    fit()
    focusPlace()
  } catch { failed.value = true }
})
onBeforeUnmount(() => map.value?.destroy())

watch(() => props.places, ps => { map.value?.setPlaces(ps); fit(); focusPlace() })
watch(() => props.highlight, h => { map.value?.highlight(h ?? []); fit() })
watch(() => props.journey, j => { if (map.value) { emit('journey', map.value.setJourney(j ?? null)); if (!j) fit() } })
watch(() => props.focus, () => { focused = ''; focusPlace() })
watch(script, () => map.value?.setConv(conv))
defineExpose({ map })
</script>
