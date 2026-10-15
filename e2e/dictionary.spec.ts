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

  test('unknown words', async ({ page }) => {
    await page.goto('/latn/dict/xqzzv')
    await expect(page.getByTestId('dict-empty')).toBeVisible()
  })
})
