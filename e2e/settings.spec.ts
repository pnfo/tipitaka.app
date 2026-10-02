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
    await page.getByTestId('bookmark-btn').click()
    await expect(page.getByTestId('toast')).toBeVisible()
    await page.goto('/latn/bookmarks')
    await expect(page.getByTestId('bookmarks')).toContainText('Sāmaññaphalasuttaṃ')
    await page.goto('/latn')
    await expect(page.getByTestId('history-item').first()).toBeVisible()
  })
})
