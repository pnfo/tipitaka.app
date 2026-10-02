import { expect, test } from '@playwright/test'

test.describe('api', () => {
  test('read-only named operations only', async ({ request }) => {
    // the v2 endpoint that ran client sql is gone
    expect([404, 405]).toContain((await request.post('/sql-query', { data: { query: 'select 1', dbname: 'text.db' } })).status())
    expect((await request.get('/api/node?key=dn-1-1')).status()).toBe(200)
    expect((await request.get('/api/node?key=nope')).status()).toBe(404)
    expect((await request.get('/api/text?key=dn-1-1&from=x')).status()).toBe(400)
    expect((await request.get("/api/titles?q=' OR 1=1 --")).status()).toBe(200)
    expect((await request.get('/api/nope')).status()).toBe(404)
    const long = 'a'.repeat(20000)
    expect((await request.get(`/api/fts?q=${long}`)).status()).toBe(400)
  })

  test('responses are cacheable with the content hash', async ({ request }) => {
    const health = await (await request.get('/api/health')).json()
    const res = await request.get(`/api/node?key=dn-1-1&v=${health.meta.contentHash}`)
    expect(res.headers()['cache-control']).toContain('immutable')
    expect(res.headers().etag).toBeTruthy()
  })
})
