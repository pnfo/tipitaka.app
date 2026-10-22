import { expect, test } from '@playwright/test'

// the usage counts (web/src/composables/stats.ts): nothing is sent before the visitor interacts (crawlers that run
// the app never do), then the visit, and when the page is hidden the pages and requests
test('usage counts start with an interaction', async ({ page }) => {
  const beacons: Record<string, unknown>[] = []
  await page.addInitScript(() => { (window as { __tipitakaStatsTest?: boolean }).__tipitakaStatsTest = true })
  await page.route('**/api/beacon', route => { beacons.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill({ status: 204 }) })

  await page.goto('/latn/dn-1-1')
  await expect(page.locator('#app article, #app [data-testid="reader"]').first()).toBeVisible()
  await page.waitForTimeout(300)
  expect(beacons).toEqual([]) // no interaction yet

  await page.mouse.click(5, 300)
  await expect.poll(() => beacons.length).toBe(1)
  expect(beacons[0]).toMatchObject({ visit: { new: true, day: true, week: true, month: true, script: 'latn', lang: 'en' } })

  await page.evaluate(() => { // the page is hidden (another tab or app): the counts so far are sent
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => beacons.length).toBe(2)
  expect(beacons[1]).toMatchObject({ pages: { read: 1 }, ops: { children: expect.any(Number), glosses: 1 } })
})
