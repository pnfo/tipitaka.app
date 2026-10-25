import { expect, test } from '@playwright/test'
import { openMenu, wordPoint } from './helpers'

test.describe('menu', () => {
  test('phones: over the page; closes on a page, Escape, the backdrop and the contents', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phones only')
    await page.goto('/latn/dn-1-1')
    const nav = page.getByTestId('nav-pane')
    await expect(nav).toBeHidden()
    await page.getByTestId('nav-toggle').click()
    await expect(nav).toBeVisible()
    await expect(page.getByTestId('nav-pin')).toHaveCount(0) // no room for a column
    await nav.getByTestId('nav-bookmarks').click()
    await expect(page).toHaveURL(/\/latn\/bookmarks$/)
    await expect(nav).toBeHidden()
    await page.getByTestId('nav-toggle').click()
    await page.keyboard.press('Escape')
    await expect(nav).toBeHidden()
    await page.getByTestId('nav-toggle').click()
    await page.mouse.click(10, 300) // the backdrop
    await expect(nav).toBeHidden()
    await page.getByTestId('nav-toggle').click()
    await page.getByTestId('tree-toggle').click() // one drawer at a time
    await expect(nav).toBeHidden()
    await expect(page.getByTestId('tree-drawer')).toBeVisible()
    await page.getByTestId('nav-toggle').click()
    await expect(page.getByTestId('tree-drawer')).toBeHidden()
  })

  test('wide screens: a column that can be closed and kept open again', async ({ page, isMobile }) => {
    test.skip(isMobile, 'wide screens only')
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.goto('/latn/dn-1-1')
    const nav = page.getByTestId('nav-pane')
    await expect(nav).toBeVisible()
    await expect(nav).toHaveCSS('position', 'sticky')
    await nav.getByTestId('nav-close').click()
    await expect(nav).toBeHidden()
    await page.reload()
    await expect(page.getByTestId('reader').locator('.para.heading').first()).toBeVisible()
    await expect(nav).toBeHidden() // remembered
    await page.getByTestId('nav-toggle').click()
    await expect(nav).toHaveCSS('position', 'fixed')
    await page.getByTestId('nav-pin').click()
    await expect(nav).toHaveCSS('position', 'sticky')
    // the dictionary takes the room of the column while it is open
    const w = await wordPoint(page, 'Brahmajāla')
    await page.mouse.click(w.x, w.y)
    await expect(page.getByTestId('study-panel')).toBeVisible()
    await expect(nav).toBeHidden()
    await page.getByTestId('panel-close').click()
    await expect(nav).toBeVisible()
  })

  test('common settings: script, language, colours, text size', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    const nav = await openMenu(page)
    await nav.getByTestId('nav-theme-dark').click()
    await expect(page.locator('html')).toHaveClass('dark')
    await nav.getByTestId('nav-text-larger').click()
    await expect(nav.getByTestId('nav-text-size')).toHaveText('19')
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--text-size'))).toBe('19px')
    await nav.getByTestId('lang-picker').click()
    await page.getByTestId('lang-si').click()
    await expect(page.locator('html')).toHaveAttribute('data-ui-lang', 'si')
    await nav.getByTestId('script-picker').click()
    await page.getByTestId('script-sinh').click()
    await expect(page).toHaveURL(/\/sinh\/dn-1-1/)
  })

  test('back to the text from any other page', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    await expect(page.getByTestId('reader').locator('.para.heading').first()).toBeVisible()
    await expect(page.getByTestId('back-to-text')).toHaveCount(0) // already reading
    await (await openMenu(page)).getByTestId('nav-help').click()
    await expect(page).toHaveURL(/\/latn\/help$/)
    await page.getByTestId('back-to-text').click()
    await expect(page).toHaveURL(/\/latn\/dn-1-1/)
  })

  test('the page of the menu is marked; a page opened directly closes to the home page', async ({ page }) => {
    await page.goto('/latn/about')
    const nav = await openMenu(page)
    await expect(nav.getByTestId('nav-about')).toHaveAttribute('aria-current', 'page')
    await page.keyboard.press('Escape')
    await page.getByTestId('page-close').click()
    await expect(page).toHaveURL(/\/latn$/)
  })

  test('the map fills the room of a closed column', async ({ page, isMobile }) => {
    test.skip(isMobile, 'wide screens only')
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.goto('/latn/map')
    const box = page.getByTestId('map-page')
    const drawing = page.locator('.leaflet-tmLand-pane svg').first()
    await expect(drawing).toBeVisible()
    await page.getByTestId('nav-pane').getByTestId('nav-close').click()
    await page.getByTestId('tree-toggle').click()
    // the drawing (the map size + 10% around) reaches the right edge of the larger box
    await expect.poll(async () => (await drawing.boundingBox())!.x + (await drawing.boundingBox())!.width - ((await box.boundingBox())!.x + (await box.boundingBox())!.width))
      .toBeGreaterThanOrEqual(0)
  })
})
