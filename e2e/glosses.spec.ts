import { expect, test } from '@playwright/test'
import { wordPoint } from './helpers'

// commentary alignment (glosses): dashed underlines on the words a commentary explains, their explanation in the
// lookup panel (fixture: DN 1 with its aṭṭhakathā and ṭīkā)
test.describe('glosses', () => {
  test('underlines the explained words instead of marking paragraphs', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    const reader = page.getByTestId('reader')
    await expect(reader.locator('.gl-atta').first()).toBeVisible()
    expect(await reader.locator('.gl[data-g]').count()).toBeGreaterThan(20)
    expect(await reader.locator('.para.linked').count()).toBe(0)
    await expect(reader.locator('.gl', { hasText: 'sambahulānaṃ' }).first()).toHaveClass(/gl-atta/)
  })

  test('tapping an underlined word: dictionary, and its explanation in the Commentary tab', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    const word = page.getByTestId('reader').locator('.gl', { hasText: 'sambahulānaṃ' }).first()
    await word.scrollIntoViewIfNeeded()
    const at = await wordPoint(page, 'sambahulānaṃ')
    await page.mouse.click(at.x, at.y)
    const panel = page.getByTestId('study-panel')
    await expect(panel.getByTestId('dict-word')).toHaveText(/sambahulānaṃ/i)
    await expect(panel.getByTestId('gloss-count')).toBeVisible()
    await panel.getByTestId('panel-tab-links').click()
    const item = panel.getByTestId('gloss-item').first()
    await expect(item).toContainText('bahukānaṃ')
    await expect(item.locator('.gl-hover')).toHaveText('Sambahulāna')
    // the panel stays on the Commentary tab for the next word
    // (on phones the sheet covers the lower half: bring the word to the upper part of the screen)
    await page.getByTestId('reader').locator('.gl', { hasText: 'maṇḍalamāḷe' }).first()
      .evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - window.innerHeight * 0.25))
    const next = await wordPoint(page, 'maṇḍalamāḷe')
    await page.mouse.click(next.x, next.y)
    await expect(panel.getByTestId('gloss-item').first()).toContainText('Maṇḍalamāḷe')
  })

  test('the underlines can be turned off', async ({ page }) => {
    await page.goto('/latn/settings')
    await page.getByTestId('glosses-setting').uncheck()
    await page.goto('/latn/dn-1-1')
    await expect(page.getByTestId('reader').locator('.para.bodytext').first()).toBeVisible()
    expect(await page.getByTestId('reader').locator('.gl').count()).toBe(0)
  })
})
