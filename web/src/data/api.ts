/**
 * The data API (server/engine Call ops). Two sources with the same JSON contract:
 *  - HttpSource: GET /api/<op>?params on the Go server (website, desktop app)
 *  - NativeSource: the engine compiled into the Android / iOS app, reached through the native bridge
 * The front door (Api) adds a small LRU cache, request de-duplication and the SSR prefill.
 */
import type { DictResult, Dict, Entity, EntityInfo, EntityType, FtsResult, LegacyTarget, Link, MentionRef, Meta, NodeInfo, ParaName, TextChunk, TitleHit, TNode, Gloss, UnitSetting } from './types'

export type Params = Record<string, string | number | boolean | undefined>

export class ApiError extends Error {
  constructor(message: string, public code: 'bad_request' | 'not_found' | 'too_broad' | 'timeout' | 'no_dict' | 'internal' | 'network') { super(message) }
}

export interface DataSource {
  call<T>(op: string, params: Params): Promise<T>
}

/** string params with sorted keys (must equal server/ssr.go cacheKey) */
export function normParams(params: Params): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.keys(params).sort()) {
    const v = params[k]
    if (v === undefined || v === '' || v === false) continue
    out[k] = v === true ? '1' : String(v)
  }
  return out
}
export const cacheKey = (op: string, params: Params) => `${op}|${JSON.stringify(normParams(params))}`

export class HttpSource implements DataSource {
  constructor(private base = import.meta.env.BASE_URL, private version = () => contentVersion(), private fetchImpl: typeof fetch = (...a) => fetch(...a)) {}
  async call<T>(op: string, params: Params): Promise<T> {
    const qs = new URLSearchParams(normParams(params))
    const v = this.version()
    if (v) qs.set('v', v)
    let res: Response
    try {
      res = await this.fetchImpl(`${this.base}api/${op}?${qs}`)
    } catch (e) {
      throw new ApiError((e as Error).message, 'network')
    }
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(body?.message ?? `HTTP ${res.status}`, body?.error ?? 'internal')
    return body as T
  }
}

/** the apps' bridge: requests are answered asynchronously by window.__tipitakaResolve(id, response) */
export class NativeSource implements DataSource {
  private pending = new Map<string, (r: string) => void>()
  private seq = 0
  constructor(private send: (id: string, request: string) => void) {
    window.__tipitakaResolve = (id, response) => {
      const fn = this.pending.get(id)
      this.pending.delete(id)
      fn?.(response)
    }
  }
  call<T>(op: string, params: Params): Promise<T> {
    const id = `q${++this.seq}`
    const request = JSON.stringify({ op, ...normParams(params) })
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, raw => {
        let r: { ok?: T; error?: string; message?: string }
        try { r = JSON.parse(raw) } catch { return reject(new ApiError('invalid response', 'internal')) }
        if (r.error) reject(new ApiError(r.message ?? r.error, r.error as ApiError['code']))
        else resolve(r.ok as T)
      })
      try { this.send(id, request) } catch (e) { this.pending.delete(id); reject(new ApiError(String(e), 'internal')) }
    })
  }
}

export function nativeSender(): ((id: string, request: string) => void) | null {
  if (typeof window === 'undefined') return null
  if (window.TipitakaNative) return (id, request) => window.TipitakaNative!.query(id, request)
  const ios = window.webkit?.messageHandlers?.tipitaka
  if (ios) return (id, request) => ios.postMessage({ id, request })
  return null
}

export const isNativeApp = () => __IS_APP__ || nativeSender() !== null

/** the desktop app (server/desktop.go): the web build in a Wails window, the api is same-origin as on the site */
export const isDesktopApp = () => typeof window !== 'undefined' && !!window.runtime?.BrowserOpenURL

/** content hash of the data: from the server page (SSR) or the app build */
export function contentVersion(): string {
  if (typeof document !== 'undefined') {
    const m = document.querySelector('meta[name="tipitaka-content"]')?.getAttribute('content')
    if (m) return m
  }
  return __BUILD_INFO__.content_hash || ''
}

class Lru<V> {
  private map = new Map<string, V>()
  constructor(private max: number) {}
  get(k: string) {
    const v = this.map.get(k)
    if (v !== undefined) { this.map.delete(k); this.map.set(k, v) }
    return v
  }
  set(k: string, v: V) {
    this.map.delete(k)
    this.map.set(k, v)
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string)
  }
}

/** API responses embedded by the server in <script id="ssr-data"> (server/ssr.go) */
export function readSsrData(): Record<string, unknown> {
  if (typeof document === 'undefined') return {}
  const el = document.getElementById('ssr-data')
  if (!el?.textContent) return {}
  try { return JSON.parse(el.textContent) } catch { return {} }
}

// ops that are not cached (search paging is cached by the engine)
const NO_CACHE = new Set(['meta'])

export class Api {
  private cache = new Lru<unknown>(300)
  private inflight = new Map<string, Promise<unknown>>()
  constructor(public source: DataSource, prefill: Record<string, unknown> = {}) {
    for (const [k, v] of Object.entries(prefill)) this.cache.set(k, v)
  }
  call<T>(op: string, params: Params = {}): Promise<T> {
    const key = cacheKey(op, params)
    const hit = this.cache.get(key)
    if (hit !== undefined) return Promise.resolve(hit as T)
    let p = this.inflight.get(key)
    if (!p) {
      p = this.source.call<T>(op, params).then(r => { if (!NO_CACHE.has(op)) this.cache.set(key, r); return r })
        .finally(() => this.inflight.delete(key))
      this.inflight.set(key, p)
    }
    return p as Promise<T>
  }
  // typed helpers
  meta = () => this.call<Meta>('meta')
  children = (key: string) => this.call<TNode[]>('children', { key })
  node = (key: string) => this.call<NodeInfo>('node', { key })
  text = (key: string, from?: number, count?: number) => this.call<TextChunk>('text', { key, from, count })
  links = (key: string, from?: number, to?: number) => this.call<Link[]>('links', { key, from, to })
  glosses = (key: string, from?: number, to?: number) => this.call<Gloss[]>('glosses', { key, from, to })
  titles = (q: string, filter?: string[], limit?: number) => this.call<TitleHit[]>('titles', { q, filter: filter?.join(','), limit })
  fts = (p: { q: string; exact?: boolean; phrase?: boolean; order?: boolean; distance?: number; filter?: string[]; combo?: number; group?: string; sortFreq?: boolean; page?: number; pageSize?: number }) =>
    this.call<FtsResult>('fts', { ...p, filter: p.filter?.join(',') })
  dicts = () => this.call<Dict[]>('dicts')
  dict = (w: string, dicts?: string[], limit?: number) => this.call<DictResult>('dict', { w, dicts: dicts?.join(','), limit })
  lookup = (w: string, dicts?: string[], limit?: number) => this.call<DictResult>('lookup', { w, dicts: dicts?.join(','), limit })
  legacy = (file: string, line: number) => this.call<LegacyTarget>('legacy', { file, line })
  names = (q = '', types?: EntityType[], limit?: number) => this.call<Entity[]>('names', { q, types: types?.join(','), limit })
  entity = (slug: string) => this.call<EntityInfo>('entity', { slug })
  /** the setting of the sutta / story around a paragraph (null: none) */
  settings = (key: string, para?: number) => this.call<UnitSetting | null>('settings', { key, para })
  /** the mentions of a name in a book (maybe: those that may be it or a namesake), 100 a page */
  mentions = (slug: string, book: number, maybe = false, page = 0) => this.call<MentionRef[]>('mentions', { slug, book, maybe, page })
  paranames = (key: string, from?: number, to?: number) => this.call<ParaName[]>('paranames', { key, from, to })
}

let api: Api | null = null
export function useApi(): Api {
  if (!api) {
    const send = nativeSender()
    api = new Api(send ? new NativeSource(send) : new HttpSource(), readSsrData())
  }
  return api
}
export const setApi = (a: Api) => { api = a } // tests
