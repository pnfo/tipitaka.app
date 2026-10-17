import { expect, test } from '@playwright/test'
import { paraOptions } from './helpers'

// columns of a text and its commentary scroll together through the gloss anchors (desktop only)
test('the commentary column follows the mūla column word by word', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 })
  await page.goto('/latn/dn-1-1')
  await paraOptions(page, page.getByTestId('reader').locator('.para.has-num').first())
  await page.getByTestId('menu-alongside').first().click()
  const cols = page.getByTestId('column')
  await expect(cols).toHaveCount(2)
  await expect(cols.nth(1).locator('.gl').first()).toBeVisible()
  const box = (await cols.nth(0).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 400)
  let close = 0
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(400)
    // the first anchored word at the top of the mūla column and its lemma in the commentary column
    const dy = await page.evaluate(() => {
      const [a, b] = [...document.querySelectorAll('[data-testid=column] .overflow-y-auto')]
      const top = a.getBoundingClientRect().top + 20
      const first = [...a.querySelectorAll<HTMLElement>('.gl[data-g]:not(.gl-lo)')].find(el => el.getBoundingClientRect().top >= top - 5)
      for (const id of first?.dataset.g?.split(' ') ?? []) {
        const el = b.querySelector(`.gl[data-g~="${id}"]`)
        if (el) return Math.abs(el.getBoundingClientRect().top - first!.getBoundingClientRect().top)
      }
      return null
    })
    if (dy !== null && dy < 300) close++
  }
  expect(close).toBeGreaterThanOrEqual(3)
})
