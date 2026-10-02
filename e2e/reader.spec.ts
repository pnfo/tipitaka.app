import { expect, test } from '@playwright/test'

test.describe('reader', () => {
  test('opens a sutta at its start with breadcrumb and tree', async ({ page, isMobile }) => {
    await page.goto('/latn/dn-1-1')
    const reader = page.getByTestId('reader')
    await expect(reader.locator('.para.heading').first()).toHaveText('1. Brahmajālasuttaṃ')
    await expect(page.getByTestId('breadcrumb')).toContainText('Brahmajālasuttaṃ')
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

  test('changes the script in the url and the text', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    await page.getByTestId('script-picker').click()
    await page.getByTestId('script-sinh').click()
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

  test('groups list their children', async ({ page }) => {
    await page.goto('/latn/dn')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dīghanikāya')
    await page.getByRole('link', { name: 'Sīlakkhandhavaggapāḷi' }).first().click()
    await expect(page).toHaveURL(/\/latn\/dn-1$/)
  })

  test('unknown keys show an error', async ({ page }) => {
    await page.goto('/latn/nope-1')
    await expect(page.getByText('This page does not exist.')).toBeVisible()
  })

  test('bare keys redirect to the saved script', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    await page.getByTestId('script-picker').click()
    await page.getByTestId('script-thai').click()
    await page.goto('/mn-1-1-1')
    await expect(page).toHaveURL(/\/thai\/mn-1-1-1/)
  })
})
