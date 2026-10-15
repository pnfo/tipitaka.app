import { expect, test, type Page } from '@playwright/test'
import { paraOptions } from './helpers'

/** the header script picker (wide screens) or the settings dropdown (phones) */
async function pickScript(page: Page, isMobile: boolean, code: string) {
  if (isMobile) {
    await expect(page.getByTestId('script-picker')).toBeHidden()
    await page.goto('/latn/settings')
    await page.getByTestId('settings-script').getByTestId('script-picker').click()
    await page.getByTestId(`script-${code}`).click()
    await expect(page).toHaveURL(new RegExp(`/${code}/settings`))
  } else {
    await page.getByTestId('script-picker').click()
    await page.getByTestId(`script-${code}`).click()
  }
}

test.describe('reader', () => {
  test('opens a sutta at its start with breadcrumb and tree', async ({ page, isMobile }) => {
    await page.goto('/latn/dn-1-1')
    const reader = page.getByTestId('reader')
    await expect(reader.locator('.para.heading').first()).toHaveText('1. Brahmajālasuttaṃ')
    await expect(page).toHaveTitle(/Brahmajālasuttaṃ – Sīlakkhandhavaggapāḷi \| Tipiṭaka\.app/)
    await expect(page.getByTestId('load-prev')).toBeVisible() // the book starts before the sutta
    if (isMobile) await page.getByTestId('tree-toggle').click()
    await expect(page.getByTestId('tree').locator('[aria-current="page"]')).toContainText('Brahmajālasuttaṃ')
  })

  test('loads more text when scrolling and the previous text on request', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    const paras = page.getByTestId('reader').locator('.para')
    await expect(paras.first()).toBeVisible()
    const n = await paras.count()
    for (let i = 0; i < 8 && (await paras.count()) === n; i++) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await page.waitForTimeout(250)
    }
    expect(await paras.count()).toBeGreaterThan(n)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.getByTestId('load-prev').click()
    await expect(page.getByTestId('reader').locator('.para.nikaya')).toHaveText('Dīghanikāyo')
  })

  test('changes the script in the url and the text', async ({ page, isMobile }) => {
    await page.goto('/latn/dn-1-1')
    await pickScript(page, isMobile, 'sinh')
    if (isMobile) await page.goto('/dn-1-1')
    await expect(page).toHaveURL(/\/sinh\/dn-1-1/)
    await expect(page.getByTestId('reader').locator('.para.heading').first()).toHaveText(/^1\. බ්\u200d?රහ්මජාලසුත්තං$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'pi-Sinh')
  })

  test('scrolls to a paragraph target and highlights search words', async ({ page }) => {
    await page.goto('/latn/dn-1-1?hl=bhikkhave#p30')
    await expect(page.locator('#p30')).toHaveClass(/target/)
    await expect(page.locator('#p30')).toBeInViewport()
    await expect(page.getByTestId('reader').locator('mark').first()).toHaveText(/bhikkhave/i)
  })

  test('shows variant readings in a popover', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    const ptr = page.getByTestId('reader').locator('.note-ptr').first()
    await ptr.click()
    await expect(page.getByRole('dialog')).toContainText('anubaddhā')
  })

  test('variant readings use the font of the script (the popover is outside the reader)', async ({ page }) => {
    await page.goto('/sinh/dn-1-1')
    await page.getByTestId('reader').locator('.note-ptr').first().click()
    const note = page.getByRole('dialog').locator('.reading')
    await expect(note).toBeVisible()
    expect(await note.evaluate(el => getComputedStyle(el).fontFamily)).toContain('pali-sinh')
  })

  test('groups list their children', async ({ page }) => {
    await page.goto('/latn/dn')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dīghanikāya')
    await page.getByRole('link', { name: 'Sīlakkhandhavaggapāḷi' }).first().click()
    await expect(page).toHaveURL(/\/latn\/dn-1$/)
  })

  test('paragraph and heading options: link, copy, bookmark', async ({ page, context, browserName }) => {
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/latn/dn-1-1')
    const reader = page.getByTestId('reader')
    // every paragraph, verse and heading has the options button
    await expect(reader.locator('.para')).toHaveCount(await reader.getByTestId('para-options').count())
    await paraOptions(page, reader.locator('.para.heading').first())
    const menu = page.getByTestId('para-menu')
    await menu.getByTestId('menu-link').click()
    await expect(page.getByTestId('toast')).toBeVisible()
    if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/latn\/dn-1-1#p\d+$/)
    await paraOptions(page, reader.locator('.para.bodytext').nth(1)) // plain paragraphs too
    await page.getByTestId('para-menu').getByTestId('menu-bookmark').click()
    await page.goto('/latn/bookmarks')
    await expect(page.getByTestId('bookmarks').locator('li')).toHaveCount(1)
  })

  test('the options button stays while the pointer moves from the text to it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'hover: desktop only')
    await page.goto('/latn/dn-1-1')
    const para = page.getByTestId('reader').locator('.para.bodytext').nth(1)
    const dots = para.locator('xpath=..').getByTestId('para-options')
    const p = (await para.boundingBox())!
    await page.mouse.move(p.x + 80, p.y + p.height / 2)
    await expect(dots).toBeVisible()
    const d = (await dots.boundingBox())!
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 12 }) // through the margin
    await expect(dots).toBeVisible()
    await page.mouse.down()
    await page.mouse.up()
    await expect(page.getByTestId('para-menu')).toBeVisible()
  })

  test('unknown keys show an error', async ({ page }) => {
    await page.goto('/latn/nope-1')
    await expect(page.getByText('This page does not exist.')).toBeVisible()
  })

  test('bare keys redirect to the saved script', async ({ page, isMobile }) => {
    await page.goto('/latn/dn-1-1')
    await pickScript(page, isMobile, 'thai')
    await page.goto('/mn-1-1-1')
    await expect(page).toHaveURL(/\/thai\/mn-1-1-1/)
  })
})
