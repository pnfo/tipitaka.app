/** proper names: labels shared by the setting panel and the names pages */
import type { Entity, EntityType, SettingRole } from '@/data/types'
import type { MapPlace } from '@/map/draw'
import { useApi } from '@/data/api'
import { t } from '@/i18n'

// functions: t() must run after the interface language is loaded
export const ROLE_LABEL: Record<SettingRole, () => string> = {
  place: () => t('Taught at'),
  teacher: () => t('Taught by'),
  with: () => t('With'),
  about: () => t('About'),
}

export const TYPE_LABEL: Record<EntityType, () => string> = {
  place: () => t('Places'),
  person: () => t('People'),
  group: () => t('Peoples and clans'),
  deity: () => t('Deities'),
  animal: () => t('Animals'),
}

/** the journeys of the base map (npm run names:geo): the sutta that tells them */
export const JOURNEYS = [
  { id: 'mahaparinibbana', key: 'dn-2-3', title: () => t('The last journey (DN 16)') },
  { id: 'parayana', key: 'kn-snp-5', title: () => t('The journey of Bāvarī’s students (Sn 5)') },
]

let located: Promise<Entity[]> | null = null
/** the places (and peoples) with coordinates and a setting, the most frequent first (one request per session) */
export function locatedPlaces(): Promise<Entity[]> {
  located ??= useApi().names('', ['place', 'group']).then(es => es.filter(e => e.lat !== undefined && e.lon !== undefined))
    .catch(() => { located = null; return [] })
  return located
}

/** a country, kingdom, district …: an area, drawn as a region (SuttaCentral's mahājanapadas), not as a point */
export const isArea = (e: Entity) => /countries|continents|country|kingdom|district|region|province|janapada/.test(e.family ?? '')

/** an entity as a map place */
export const mapPlace = (e: Entity, kind: MapPlace['kind'], extra: Partial<MapPlace> = {}): MapPlace =>
  ({ slug: e.slug, name: e.name, lat: e.lat!, lon: e.lon!, prec: e.prec, kind, meaning: e.meaning, ...extra })

/** the big cities as faint points of orientation (not the given slugs) */
export async function contextPlaces(skip: string[] = [], n = 12): Promise<MapPlace[]> {
  const cities = (await locatedPlaces()).filter(e => e.type === 'place' && /cities/.test(e.family ?? '') && !skip.includes(e.slug))
  return cities.slice(0, n).map((e, i) => mapPlace(e, 'context', { label: i < 6 }))
}
