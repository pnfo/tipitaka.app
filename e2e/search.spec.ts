import { expect, test } from '@playwright/test'

test.describe('search', () => {
  test('the search box suggests titles and runs a text search', async ({ page }) => {
    await page.goto('/latn')
    const input = page.getByTestId('search-input')
    await input.fill('brahmajāla')
    const menu = page.getByTestId('search-menu')
    await expect(menu).toContainText('1. Brahmajālasuttaṃ')
    await input.press('Enter')
    await expect(page).toHaveURL(/\/latn\/search\/brahmaj/)
    await expect(page.getByTestId('fts-summary')).toContainText('matches')
  })

  test('full text results, combos, options and opening a hit', async ({ page }) => {
    await page.goto('/latn/search/bhikkhave')
    await expect(page.getByTestId('fts-hits').locator('li').first()).toBeVisible()
    await expect(page.getByTestId('fts-hits').locator('mark').first()).toHaveText(/bhikkhave/i)
    await page.getByTestId('opt-exact').click()
    await expect(page).toHaveURL(/exact=1/)
    await expect(page.getByTestId('fts-combos')).toHaveCount(0) // exact: one word form
    await page.getByTestId('fts-hits').locator('a').first().click()
    await expect(page).toHaveURL(/#p\d+/)
    await expect(page.locator('.para.target mark').first()).toBeVisible()
  })

  test('phrase search and filters', async ({ page }) => {
    await page.goto('/latn/search/evaṃ me sutaṃ?phrase=1&exact=1')
    await expect(page.getByTestId('fts-summary')).toContainText(/[1-9]\d* matches/)
    await page.getByTestId('filter-atta').click()
    await expect(page).toHaveURL(/filter=atta/)
    for (const t of await page.getByTestId('fts-hits').locator('a').evaluateAll(as => as.map(a => a.getAttribute('href'))))
      expect(t).toMatch(/\/atta-/)
  })

  test('diacritic insensitive, suffix and broad queries', async ({ page }) => {
    await page.goto('/latn/search/bhagava?exact=1')
    await expect(page.getByTestId('fts-summary')).toContainText(/[1-9]/)
    await page.goto('/latn/search/*ssa')
    await expect(page.getByTestId('fts-hits').locator('li').first()).toBeVisible()
    await page.goto('/latn/search/*')
    await expect(page.getByTestId('fts-error')).toBeVisible()
  })

  test('input in another script is converted', async ({ page }) => {
    await page.goto('/sinh')
    await page.getByTestId('search-input').fill('භික්ඛවෙ')
    await page.getByTestId('search-input').press('Enter')
    await expect(page).toHaveURL(/\/sinh\/search\/bhikkhave/)
  })

  test('title search', async ({ page }) => {
    await page.goto('/latn/titles/sila')
    await expect(page.getByTestId('title-hits')).toContainText('Cūḷasīlaṃ')
  })
})
