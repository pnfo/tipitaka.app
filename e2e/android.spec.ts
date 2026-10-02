/**
 * The offline app build (web/dist-app, hash routing, relative paths) with a simulated native bridge:
 * window.TipitakaNative.query(id, request) is answered asynchronously through window.__tipitakaResolve,
 * here by forwarding the request to the engine over HTTP from the test runner (dev-docs/native-bridge.md).
 */
import { expect, test, type Page } from '@playwright/test'
import { APP, SERVER } from './playwright.config'

async function withBridge(page: Page) {
  const apiCalls: string[] = []
  page.on('request', r => { if (r.url().includes('/api/')) apiCalls.push(r.url()) })
  await page.exposeFunction('__nativeQuery', async (request: string) => {
    const { op, ...params } = JSON.parse(request)
    const res = await fetch(`${SERVER}/api/${op}?${new URLSearchParams(params)}`)
    const body = await res.json()
    return JSON.stringify(res.ok ? { ok: body } : body)
  })
  await page.addInitScript(() => {
    const w = window as unknown as { TipitakaNative: unknown; __nativeQuery: (r: string) => Promise<string>; __tipitakaResolve: (id: string, r: string) => void }
    w.TipitakaNative = { query: (id: string, request: string) => { w.__nativeQuery(request).then(r => setTimeout(() => w.__tipitakaResolve(id, r), 5)) } }
  })
  return apiCalls
}

test('reads, searches and looks up words through the bridge', async ({ page }) => {
  const apiCalls = await withBridge(page)
  await page.goto(`${APP}/index.html#/latn/dn-1-1`)
  await expect(page.getByTestId('reader').locator('.para.heading').first()).toHaveText('1. Brahmajālasuttaṃ')
  await page.goto(`${APP}/index.html#/latn/search/bhikkhave`)
  await expect(page.getByTestId('fts-hits').locator('li').first()).toBeVisible()
  await page.goto(`${APP}/index.html#/latn/dict/dhamma`)
  await expect(page.getByTestId('dpd-head').first()).toBeVisible()
  expect(apiCalls).toEqual([]) // the page itself never used the network api
})

test('v2 links work in the app', async ({ page }) => {
  await withBridge(page)
  await page.goto(`${APP}/index.html#/?a=aa1-4-ro`)
  await expect(page).toHaveURL(/#\/latn\/dn-1-1#p\d+/)
})
