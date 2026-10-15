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

  test('several words: exact phrase (default) or near each other; options only when relevant', async ({ page }) => {
    await page.goto('/latn/search/bhikkhave')
    await expect(page.getByTestId('opt-exact')).toBeVisible()
    await expect(page.getByTestId('opt-phrase')).toHaveCount(0) // one word: no phrase / order / distance
    await page.goto('/latn/search/evaṃ me sutaṃ?exact=1')
    await expect(page.getByTestId('opt-phrase')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('opt-order')).toHaveCount(0)
    await expect(page.getByTestId('fts-summary')).toContainText(/[1-9]\d* matches/)
    await page.getByTestId('opt-near').click()
    await expect(page).toHaveURL(/mode=near/)
    await expect(page.getByTestId('opt-order')).toBeVisible()
    await expect(page.getByTestId('opt-distance')).toBeVisible()
  })

  test('collection filter dialog (full text and titles)', async ({ page }) => {
    await page.goto('/latn/search/evaṃ me sutaṃ?exact=1')
    await page.getByTestId('collection-filter').click()
    const dialog = page.getByTestId('collection-dialog')
    await expect(dialog.getByTestId('coll-anya')).not.toBeChecked() // default: all but añña
    await expect(dialog.getByTestId('coll-vp')).toBeChecked()
    await dialog.getByTestId('coll-mula').click()
    await dialog.getByTestId('coll-tika').click()
    await dialog.getByTestId('filter-done').click()
    await expect(page.getByTestId('filter-badge')).toBeVisible()
    await expect(page.getByTestId('fts-group').first()).toBeVisible()
    for (const t of await page.getByTestId('fts-group').locator('a').evaluateAll(as => as.map(a => a.getAttribute('href'))))
      expect(t).toMatch(/\/atta-/)
    // the same filter applies to titles
    await page.getByTestId('mode-titles').click()
    await page.getByTestId('search-page-input').fill('brahmajāla')
    await expect(page.getByTestId('title-hits').locator('li').first()).toBeVisible()
    for (const t of await page.getByTestId('title-hits').locator('a').evaluateAll(as => as.map(a => a.getAttribute('href'))))
      expect(t).toMatch(/\/atta-/)
    // back to the default
    await page.getByTestId('collection-filter').click()
    await page.getByTestId('filter-default').click()
    await page.getByTestId('filter-done').click()
    await expect(page.getByTestId('filter-badge')).toHaveCount(0)
  })

  test('dictionary filter', async ({ page }) => {
    await page.goto('/latn/dict/dhamma')
    await expect(page.getByTestId('dpd-head').first()).toBeVisible()
    await page.getByTestId('dict-filter').click()
    await page.getByTestId('dict-dialog').getByTestId('dict-dpd').click()
    await page.getByTestId('dicts-done').click()
    await expect(page.getByTestId('dpd-head')).toHaveCount(0)
    await page.getByTestId('dict-filter').click()
    await page.getByTestId('dicts-all').click()
    await page.getByTestId('dicts-done').click()
    await expect(page.getByTestId('dpd-head').first()).toBeVisible()
  })

  test('back to the text from the search page', async ({ page }) => {
    await page.goto('/latn/dn-1-2')
    await expect(page.getByTestId('reader').locator('.para.heading').first()).toBeVisible()
    await page.goto('/latn/search/bhikkhave')
    await page.getByTestId('back-to-text').click()
    await expect(page).toHaveURL(/\/latn\/dn-1-2/)
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
