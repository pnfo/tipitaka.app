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

  test('full text results: word forms, texts with counts, hits in context (v2 layout)', async ({ page }) => {
    await page.goto('/latn/search/bhikkhave')
    await expect(page.getByTestId('combo').first()).toContainText('bhikkhave')
    const group = page.getByTestId('fts-group').first()
    await expect(group).toBeVisible()
    await group.getByTestId('group-expand').click()
    await expect(group.getByTestId('group-hits').locator('mark').first()).toHaveText(/bhikkhave/i)
    await page.getByTestId('opt-exact').click()
    await expect(page).toHaveURL(/exact=1/)
    await group.getByTestId('group-expand').click()
    await page.getByTestId('fts-group').first().getByTestId('group-hits').locator('a').first().click()
    await expect(page).toHaveURL(/#p\d+/)
    await expect(page.locator('.para.target mark').first()).toBeVisible()
  })

  test('word forms, all forms and sorting by hits', async ({ page }) => {
    await page.goto('/latn/search/dhamma')
    await expect(page.getByTestId('combo').nth(1)).toBeVisible() // dhamma finds several endings
    await page.getByTestId('combo-all').click()
    await expect(page).toHaveURL(/combo=all/)
    await page.getByTestId('opt-sortFreq').click()
    const counts = await page.getByTestId('fts-group').locator('.chip').allInnerTexts()
    expect(counts.map(Number)).toEqual([...counts.map(Number)].sort((a, b) => b - a))
  })

  test('phrase search and filters', async ({ page }) => {
    await page.goto('/latn/search/evaṃ me sutaṃ?phrase=1&exact=1')
    await expect(page.getByTestId('fts-summary')).toContainText(/[1-9]\d* matches/)
    await page.getByTestId('filter-atta').click()
    await expect(page).toHaveURL(/filter=atta/)
    await expect(page.getByTestId('fts-group').first()).toBeVisible()
    for (const t of await page.getByTestId('fts-group').locator('a').evaluateAll(as => as.map(a => a.getAttribute('href'))))
      expect(t).toMatch(/\/atta-/)
  })

  test('diacritic insensitive, suffix and broad queries', async ({ page }) => {
    await page.goto('/latn/search/bhagava?exact=1')
    await expect(page.getByTestId('fts-summary')).toContainText(/[1-9]/)
    await page.goto('/latn/search/*ssa')
    await expect(page.getByTestId('combo').first()).toContainText(/ssa/)
    await page.goto('/latn/search/*')
    await expect(page.getByTestId('fts-error')).toBeVisible()
  })

  test('the search type switch (text / titles / dictionary)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'same box on phones')
    await page.goto('/latn')
    await page.getByTestId('search-type').click()
    await page.getByTestId('search-type').click()
    await page.getByTestId('search-input').fill('dhamma')
    await page.getByTestId('search-input').press('Enter')
    await expect(page).toHaveURL(/\/latn\/dict\/dhamma/)
  })

  test('typing on the search page searches', async ({ page }) => {
    await page.goto('/latn/search')
    await page.getByTestId('search-page-input').fill('bhikkhave')
    await expect(page).toHaveURL(/\/latn\/search\/bhikkhave/)
    await expect(page.getByTestId('fts-group').first()).toBeVisible()
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
