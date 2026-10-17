import { expect, test } from '@playwright/test'
import { wordPoint } from './helpers'

test.describe('dictionary', () => {
  test('tapping a word looks it up (DPD + dictionaries)', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    await expect(page.getByTestId('reader').locator('.para.bodytext').first()).toBeVisible()
    const at = await wordPoint(page, 'Evaṃ')
    await page.mouse.click(at.x, at.y)
    const panel = page.getByTestId('study-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByTestId('dict-word')).toHaveText(/evaṃ/i)
    await expect(panel.getByTestId('dpd-head').first()).toBeVisible()
    await panel.getByTestId('panel-close').click()
    await expect(panel).toBeHidden()
  })

  test('dictionary page for a typed word', async ({ page }) => {
    await page.goto('/latn/dict/dhamma')
    await expect(page.getByTestId('dict-word')).toHaveText('dhamma')
    await expect(page.getByTestId('dpd-head').first()).toContainText('dhamma')
    await page.getByTestId('dpd-head').first().locator('button').click()
    await expect(page.getByTestId('dpd-head').first()).toContainText('√dhar')
  })

  test('rich entries: abbreviations, editorial marks, cross and text references (DPPN)', async ({ page }) => {
    await page.goto('/latn/dict/ambaṭṭha')
    const entry = page.locator('[data-testid=dict-entry][data-dict-code=en-dppn]').first()
    await expect(entry).toBeVisible()
    // abbreviation and editorial mark popovers (tap, not only hover)
    await entry.locator('abbr[data-a=DN]').first().click()
    await expect(page.getByTestId('dict-tip')).toContainText('Dīgha')
    await page.keyboard.press('Escape')
    await entry.locator('.ed-mod').first().click()
    await expect(page.getByTestId('dict-tip')).toContainText('Modernised')
    await page.keyboard.press('Escape')
    // a cross reference looks the name up; back returns
    await entry.locator('a[data-dict="pokkharasādi"]').first().click()
    await expect(page.getByTestId('dict-word')).toHaveText('pokkharasādi')
    await expect(page.locator('.dict-focus[data-dict-code=en-dppn]')).toBeVisible()
    await page.goBack()
    await expect(page.getByTestId('dict-word')).toHaveText('ambaṭṭha')
    // a text reference opens the paragraph (the page number, not the abbreviation)
    const ref = page.locator('[data-testid=dict-entry][data-dict-code=en-dppn] a[data-ref="dn-1-3#369"]').first()
    const box = (await ref.boundingBox())!
    await ref.click({ position: { x: box.width - 3, y: box.height / 2 } })
    await expect(page).toHaveURL(/\/latn\/dn-1-3#p369$/)
    await expect(page.getByTestId('reader')).toBeVisible()
  })

  test('PTS: the bold of the print and Unicode Greek', async ({ page }) => {
    await page.goto('/latn/dict/visati')
    const entry = page.locator('[data-testid=dict-entry][data-dict-code=en-pts]').first()
    await expect(entry.locator('b').first()).toHaveText('viś')
    await expect(entry).toContainText('οἰκέω')
  })

  test('optional dictionaries are not part of "all"', async ({ page }) => {
    await page.goto('/latn/dict/dhamma')
    await page.getByTestId('dict-filter').click()
    await expect(page.getByTestId('dict-en-pts')).toBeChecked()
    await expect(page.getByTestId('dict-vi-pced')).not.toBeChecked()
  })

  test('tapping a word without DPD chosen shows no DPD', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tipitaka.app-settings-3', JSON.stringify({ dicts: ['en-pts', 'en-ncped'] })))
    await page.goto('/latn/dn-1-1')
    await expect(page.getByTestId('reader').locator('.para.bodytext').first()).toBeVisible()
    const at = await wordPoint(page, 'Evaṃ')
    await page.mouse.click(at.x, at.y)
    const panel = page.getByTestId('study-panel')
    await expect(panel.getByTestId('dict-word')).toHaveText(/evaṃ/i)
    await expect(panel.getByTestId('dict-entry').first()).toBeVisible()
    await expect(panel.getByTestId('dpd-head')).toHaveCount(0)
  })

  test('the abbreviation of a dictionary explains it', async ({ page }) => {
    await page.goto('/latn/dict/ambaṭṭha')
    await page.locator('[data-testid=dict-entry][data-dict-code=en-dppn] [data-testid=dict-chip]').first().click()
    await expect(page.getByTestId('dict-tip')).toContainText('Proper Names')
    await expect(page.getByTestId('dict-tip')).toContainText('Malalasekera')
  })

  test('Thai references (BB notation) explain the book and open the text', async ({ page }) => {
    await page.goto('/latn/dict/sannipatita')
    const entry = page.locator('[data-testid=dict-entry][data-dict-code=th-bhumibol]').first()
    await entry.locator('abbr[data-a="ที."]').first().click()
    await expect(page.getByTestId('dict-tip')).toContainText('ทีฆนิกาย')
    await page.keyboard.press('Escape')
    const ref = entry.locator('a[data-ref="dn-1-1-1#6"]')
    const box = (await ref.boundingBox())!
    await ref.click({ position: { x: box.width - 3, y: box.height / 2 } })
    await expect(page).toHaveURL(/\/latn\/dn-1-1-1#p6$/)
  })

  test('unknown words', async ({ page }) => {
    await page.goto('/latn/dict/xqzzv')
    await expect(page.getByTestId('dict-empty')).toBeVisible()
  })
})
