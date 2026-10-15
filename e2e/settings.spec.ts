import { expect, test } from '@playwright/test'

test.describe('settings and storage', () => {
  test('theme and text size persist', async ({ page }) => {
    await page.goto('/latn/settings')
    await page.getByTestId('theme-dark').click()
    await expect(page.locator('html')).toHaveClass('dark')
    await page.reload()
    await expect(page.locator('html')).toHaveClass('dark')
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tipitaka.app-settings-3')!))
    expect(stored.theme).toBe('dark')
  })

  test('v2 settings and bookmarks are imported', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('settings', JSON.stringify({ paliScript: 'si', uiLanguage: 'si' }))
        localStorage.setItem('bookmarks', JSON.stringify({ 'aa1,4': 1600000000000 }))
        sessionStorage.setItem('seeded', '1')
      }
    })
    await page.goto('/')
    await expect(page).toHaveURL(/\/sinh$/)
    await page.goto('/sinh/bookmarks')
    await expect(page.getByTestId('bookmarks').locator('li')).toHaveCount(1)
    await expect(page.getByTestId('bookmarks')).toContainText('බ්')
  })

  test('bookmarks and history', async ({ page }) => {
    await page.goto('/latn/dn-1-2')
    await page.getByTestId('reader').locator('.para.heading').first().click()
    await page.getByTestId('menu-bookmark').click()
    await expect(page.getByTestId('toast')).toBeVisible()
    await page.goto('/latn/bookmarks')
    await expect(page.getByTestId('bookmarks')).toContainText('Sāmaññaphalasuttaṃ')
    await page.goto('/latn')
    await expect(page.getByTestId('history-item').first()).toBeVisible()
  })
})

test('script converter page', async ({ page }) => {
  await page.goto('/latn/convert')
  await page.getByTestId('convert-input').fill('ධම්මපදං')
  await page.getByTestId('convert-target').selectOption('latn')
  await expect(page.getByTestId('convert-output')).toHaveText(/dhammapadaṃ/i)
})

test('script dropdown', async ({ page }) => {
  await page.goto('/latn/settings')
  await page.getByTestId('set-script').selectOption('thai')
  await expect(page).toHaveURL(/\/thai\/settings/)
})

test('the dictionary sheet on phones keeps the height set by dragging', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only')
  await page.goto('/latn/dn-1-1')
  const para = page.getByTestId('reader').locator('.para.bodytext').first()
  const b = (await para.boundingBox())!
  await page.mouse.click(b.x + 60, b.y + 10)
  const sheet = page.getByTestId('study-panel')
  await expect(sheet).toBeVisible()
  const h0 = (await sheet.boundingBox())!.height
  // pointer events (mouse drags are not available on mobile webkit in playwright)
  const handle = page.getByTestId('sheet-handle')
  const y = (await handle.boundingBox())!.y
  await handle.dispatchEvent('pointerdown', { pointerId: 7, clientY: y, bubbles: true })
  for (const dy of [30, 80, 150]) await handle.dispatchEvent('pointermove', { pointerId: 7, clientY: y - dy, bubbles: true })
  await handle.dispatchEvent('pointerup', { pointerId: 7, clientY: y - 150, bubbles: true })
  const h1 = (await sheet.boundingBox())!.height
  expect(h1).toBeGreaterThan(h0 + 100)
  // a different word with other content: same height
  await page.getByTestId('panel-close').click()
  await page.mouse.click(b.x + 150, b.y + 40)
  await expect(sheet).toBeVisible()
  expect(Math.abs((await sheet.boundingBox())!.height - h1)).toBeLessThan(3)
})
