<!-- the setting of the sutta / story of a paragraph: where it was taught, by whom, who came, whom it is about
     (server/engine/names.go). Every name links to its page (the other suttas taught there, the people met there). -->
<template>
  <div class="text-sm" data-testid="setting-view">
    <div v-if="!ui.settingTarget" class="py-8 text-center text-muted">{{ t('Open the menu of a paragraph to see where its sutta was taught.') }}</div>
    <div v-else-if="loading" class="h-20 animate-pulse rounded bg-surface2" />
    <template v-else>
      <div v-if="!unit" class="py-6 text-center text-muted" data-testid="setting-empty">{{ t('The text does not say where this was taught.') }}</div>
      <RouterLink v-if="unit" :to="{ name: 'read', params: { script, key: unit.key }, hash: `#p${unit.para}` }" class="pali mb-3 block font-medium hover:text-primary">
        {{ conv(unit.title) }}
      </RouterLink>
      <!-- where: the places on the map (the journey of DN 16 / Sn 5), the big cities faint for orientation -->
      <PlaceMap v-if="unit && hasMap" :key="`${unit.key}:${unit.para}`" class="mb-2 h-52" compact fit-main :places="mapPlaces" :highlight="placeSlugs" :journey-key="unit.key"
        @select="openName" @journey="j => (journey = j)" />
      <p v-if="journey" class="mb-1 text-xs text-muted" data-testid="setting-journey">
        {{ t('The route: {0} stops, about {1} km', journey.stops.length, journey.total) }} ·
        <span class="pali">{{ conv(journey.stops[0].name) }} → {{ conv(journey.stops[journey.stops.length - 1].name) }}</span>
      </p>
      <RouterLink v-if="unit && hasMap" :to="mapLink" class="mb-3 inline-block text-xs text-muted underline hover:text-primary" data-testid="setting-map-link">{{ t('Open the map') }}</RouterLink>
      <div v-for="g in groups" :key="g.role" class="mb-3" :data-testid="`setting-${g.role}`">
        <div class="section-title">{{ ROLE_LABEL[g.role]() }}</div>
        <div class="flex flex-wrap gap-1.5">
          <RouterLink v-for="r in g.rows" :key="r.slug" :to="{ name: 'names', params: { script, slug: r.slug } }" class="chip hover:border-primary" :title="meaningOf(r)"
            data-testid="setting-name">
            <span class="pali">{{ conv(r.name) }}</span><span v-if="r.units > 1" class="text-xs text-muted">{{ r.units }}</span>
          </RouterLink>
        </div>
      </div>
      <!-- every name the paragraph mentions (? : may be a namesake) -->
      <div v-if="named.length" class="mb-3 mt-4" data-testid="setting-named">
        <div class="section-title">{{ t('Named in this paragraph') }}</div>
        <div class="flex flex-wrap gap-1.5">
          <RouterLink v-for="r in named" :key="r.slug" :to="{ name: 'names', params: { script, slug: r.slug } }" class="chip hover:border-primary" :title="meaningOf(r)"
            data-testid="named-name">
            <span class="pali">{{ conv(r.name) }}</span><span v-if="r.amb" class="text-xs text-muted" :title="t('May be a namesake')">?</span>
            <span v-if="r.n > 1" class="text-xs text-muted">×{{ r.n }}</span>
          </RouterLink>
        </div>
      </div>
      <p v-for="n in notes" :key="n.text" class="mt-4 text-xs text-muted" data-testid="setting-note">
        {{ n.text }}
        <RouterLink v-if="n.to" :to="n.to" class="underline hover:text-primary">{{ t('Show') }}</RouterLink>
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PlaceMap from './PlaceMap.vue'
import { useApi } from '@/data/api'
import type { ParaName, SettingRole, UnitSetting } from '@/data/types'
import type { JourneyInfo, MapPlace } from '@/map/draw'
import { useScript } from '@/composables/script'
import { useUi } from '@/stores/ui'
import { JOURNEYS, ROLE_LABEL, contextPlaces, isArea, mapPlace, meaningOf } from '@/composables/names'
import { t, uiLang } from '@/i18n'

const ui = useUi()
const api = useApi()
const { script, conv } = useScript()
const loading = ref(false)
const unit = ref<UnitSetting | null>(null)

const names = ref<ParaName[]>([])
// the reading position changes while scrolling: wait until it settles; the same unit does not reload the map
let timer: ReturnType<typeof setTimeout> | undefined
watch(() => ui.settingTarget, st => {
  clearTimeout(timer)
  if (st) timer = setTimeout(() => load(st), unit.value || names.value.length ? 250 : 0)
}, { immediate: true })
// another interface language: the descriptions again (a new object: the map is redrawn)
watch(uiLang, () => { if (ui.settingTarget) { unit.value = null; load(ui.settingTarget) } })
async function load(st: { key: string; para: number }) {
  if (ui.settingTarget !== st) return
  if (!unit.value && !names.value.length) loading.value = true
  try {
    const [u, ns] = await Promise.all([api.settings(st.key, st.para).catch(() => null), (st.para >= 0 ? api.paranames(st.key, st.para, st.para + 1).catch(() => []) : Promise.resolve([]))])
    if (ui.settingTarget !== st) return
    // the same sutta: keep the object (its map stays as it is)
    if (!(u && unit.value && u.key === unit.value.key && u.para === unit.value.para)) unit.value = u
    names.value = ns
  } finally { loading.value = false }
}
// the names of the paragraph, once each, in order
const named = computed(() => {
  const out = new Map<string, ParaName & { n: number }>()
  for (const r of names.value) { const o = out.get(r.slug); if (o) o.n++; else out.set(r.slug, { ...r, n: 1 }) }
  return [...out.values()]
})

const router = useRouter()
const journey = ref<JourneyInfo | null>(null)
const context = ref<MapPlace[]>([])
const placeRows = computed(() => (unit.value?.rows ?? []).filter(r => r.role === 'place'))
const placeSlugs = computed(() => placeRows.value.map(r => r.slug))
const mapPlaces = computed<MapPlace[]>(() => [
  ...context.value.filter(c => !placeSlugs.value.includes(c.slug)),
  // (a country is outlined as a region: highlight)
  ...placeRows.value.filter(r => r.lat !== undefined && !isArea(r)).map(r => mapPlace(r, 'main', { label: true })),
])
const journeyId = computed(() => JOURNEYS.find(j => j.key === unit.value?.key)?.id)
const hasMap = computed(() => placeRows.value.some(r => r.lat !== undefined) || !!journeyId.value)
const mapLink = computed(() => ({ name: 'map', params: { script: script.value },
  query: journeyId.value ? { journey: journeyId.value } : { place: placeRows.value.find(r => r.lat !== undefined)?.slug } }))
watch(unit, () => { journey.value = null })
contextPlaces().then(c => { context.value = c })
const openName = (slug: string) => router.push({ name: 'names', params: { script: script.value, slug } })

const ROLES: SettingRole[] = ['place', 'teacher', 'with', 'about']
const groups = computed(() => ROLES.map(role => ({ role, rows: (unit.value?.rows ?? []).filter(r => r.role === role) })).filter(g => g.rows.length))
// where the setting comes from, when not from the sutta itself
const notes = computed(() => {
  const u = unit.value
  if (!u) return []
  const out: { text: string; to?: object }[] = []
  const atta = u.rows.find(r => r.src === 'atta' || r.src === 'formula' || r.src === 'qa')
  if (atta?.src === 'atta') out.push({ text: t('From the commentary.'), to: { name: 'read', params: { script: script.value, key: atta.evKey }, hash: `#p${atta.evPara}` } })
  if (u.rows.some(r => r.src === 'inherit')) out.push({ text: t('This sutta does not name the place: it is that of the sutta before it.') })
  return out
})
</script>
