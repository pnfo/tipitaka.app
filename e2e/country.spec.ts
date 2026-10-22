import { expect, test, type Page } from '@playwright/test'

// a new visitor gets the script and interface language of their country (web/src/composables/country.ts); the
// lookup (/api/country) is answered here, test automation does not ask unless __tipitakaGeoTest is set
async function from(page: Page, country: string) {
  await page.addInitScript(() => { (window as { __tipitakaGeoTest?: boolean }).__tipitakaGeoTest = true })
  await page.route('**/api/country', route => route.fulfill({ json: { country } }))
}

test.describe('country defaults', () => {
  test('a new visitor from Sri Lanka gets Sinhala', async ({ page }) => {
    await from(page, 'LK')
    await page.goto('/')
    await expect(page).toHaveURL(/\/sinh$/)
    await expect(page.locator('html')).toHaveAttribute('data-ui-lang', 'si')
  })

  test('a new visitor from elsewhere keeps Roman and English', async ({ page }) => {
    await from(page, 'US')
    await page.goto('/')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/latn$/)
    await expect(page.locator('html')).toHaveAttribute('data-ui-lang', 'en')
  })

  test('a shared link keeps its script (the interface language follows the country)', async ({ page }) => {
    await from(page, 'IN')
    await page.goto('/thai/dn-1-1')
    await expect(page.locator('html')).toHaveAttribute('data-ui-lang', 'hi')
    await expect(page).toHaveURL(/\/thai\/dn-1-1/)
  })

  test('a returning visitor keeps their settings', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('tipitaka.app-settings-3')) localStorage.setItem('tipitaka.app-settings-3', JSON.stringify({ script: 'latn', uiLang: 'en' }))
    })
    await from(page, 'TH')
    await page.goto('/')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/latn$/)
    await expect(page.locator('html')).toHaveAttribute('data-ui-lang', 'en')
  })
})
