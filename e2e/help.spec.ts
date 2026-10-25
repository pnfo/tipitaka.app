import { expect, test } from '@playwright/test'
import { openMenu } from './helpers'

test.describe('help', () => {
  test('the menu opens the guide; its contents and links work', async ({ page }) => {
    await page.goto('/latn')
    await (await openMenu(page)).getByTestId('nav-help').click()
    await expect(page).toHaveURL(/\/latn\/help$/)
    await expect(page.locator('.help h2#language')).toBeVisible()
    await expect(page.locator('.help .help-icon').first()).toBeVisible()
    await page.getByTestId('help').locator('nav a', { hasText: 'Searching' }).click()
    await expect(page).toHaveURL(/\/latn\/help#search$/)
    await expect(page.locator('#search')).toBeInViewport()
    await page.locator('.help a[href="/bookmarks"]').first().click()
    await expect(page).toHaveURL(/\/latn\/bookmarks$/)
  })

  test('a link to a section scrolls to it; a language without a translation shows the English', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tipitaka.app-settings-3', JSON.stringify({ uiLang: 'kh' })))
    await page.goto('/latn/help#v2')
    await expect(page.locator('#v2')).toBeInViewport()
    await expect(page.getByTestId('help-notice')).toBeVisible()
  })

  test('the search pages explain themselves and give examples', async ({ page }) => {
    await page.goto('/latn/titles')
    await expect(page.getByTestId('search-intro')).toBeVisible()
    await page.getByTestId('search-example').first().click()
    await expect(page).toHaveURL(/\/latn\/titles\/brahmaj/)
    await expect(page.getByTestId('search-intro')).toHaveCount(0)
    await expect(page.getByTestId('title-hits')).toBeVisible()
  })
})
