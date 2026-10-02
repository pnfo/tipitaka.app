// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { Api, ApiError, HttpSource, NativeSource, cacheKey, normParams, readSsrData } from './api'

describe('params and cache keys', () => {
  it('normalises like server/ssr.go cacheKey', () => {
    expect(normParams({ key: 'dn-1-1', from: undefined, count: 0, exact: true, phrase: false })).toEqual({ count: '0', exact: '1', key: 'dn-1-1' })
    expect(cacheKey('node', { key: 'dn-1-1' })).toBe('node|{"key":"dn-1-1"}')
    expect(cacheKey('text', { key: 'a', from: undefined })).toBe(cacheKey('text', { key: 'a' }))
  })
})

describe('HttpSource', () => {
  it('calls /api/<op> with the content version and maps errors', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('nope')) return new Response(JSON.stringify({ error: 'not_found', message: 'not found' }), { status: 404 })
      return new Response(JSON.stringify({ url }), { status: 200 })
    })
    const src = new HttpSource('/', () => 'abc', fetchImpl as unknown as typeof fetch)
    const r = await src.call<{ url: string }>('node', { key: 'dn-1-1' })
    expect(r.url).toBe('/api/node?key=dn-1-1&v=abc')
    await expect(src.call('node', { key: 'nope' })).rejects.toMatchObject({ code: 'not_found' })
    const failing = new HttpSource('/', () => '', (async () => { throw new Error('offline') }) as unknown as typeof fetch)
    await expect(failing.call('node', {})).rejects.toMatchObject({ code: 'network' })
  })
})

describe('NativeSource', () => {
  it('sends json requests and resolves the async answers', async () => {
    const sent: [string, string][] = []
    const src = new NativeSource((id, req) => sent.push([id, req]))
    const p1 = src.call<{ x: number }>('text', { key: 'dn-1-1', from: 3 })
    const p2 = src.call('node', { key: 'nope' })
    expect(JSON.parse(sent[0][1])).toEqual({ op: 'text', key: 'dn-1-1', from: '3' })
    // answers may arrive in any order
    window.__tipitakaResolve!(sent[1][0], JSON.stringify({ error: 'not_found', message: 'x' }))
    window.__tipitakaResolve!(sent[0][0], JSON.stringify({ ok: { x: 1 } }))
    expect(await p1).toEqual({ x: 1 })
    await expect(p2).rejects.toBeInstanceOf(ApiError)
  })
})

describe('Api cache', () => {
  it('caches, dedupes in-flight requests and uses the ssr prefill', async () => {
    const call = vi.fn(async (op: string) => ({ op }))
    const api = new Api({ call } as never, { [cacheKey('node', { key: 'pre' })]: { pre: true } })
    expect(await api.node('pre')).toEqual({ pre: true })
    expect(call).not.toHaveBeenCalled()
    const [a, b] = await Promise.all([api.node('x'), api.node('x')])
    expect(a).toBe(b)
    expect(call).toHaveBeenCalledTimes(1)
    await api.node('x')
    expect(call).toHaveBeenCalledTimes(1)
  })
  it('reads the ssr data script', () => {
    document.body.innerHTML = '<script type="application/json" id="ssr-data">{"node|{}":1}</script>'
    expect(readSsrData()).toEqual({ 'node|{}': 1 })
  })
})
