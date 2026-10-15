import { expect, test } from '@playwright/test'

test.describe('tabs and columns (v2 tab views)', () => {
  test('commentary alongside: columns with linked scrolling, switching to tabs, closing', async ({ page, isMobile }) => {
    test.skip(isMobile, 'columns need a wide screen')
    await page.goto('/latn/dn-1-1')
    await page.getByTestId('commentary-btn').click()
    await page.getByTestId('partner').first().click()
    const cols = page.getByTestId('columns').getByTestId('column')
    await expect(cols).toHaveCount(2)
    await expect(cols.nth(1)).toContainText('Brahmajālasuttavaṇṇanā')
    await expect(page.getByTestId('tab')).toHaveCount(2)
    await page.getByTestId('view-tabbed').click()
    await expect(page.getByTestId('columns')).toHaveCount(0)
    await expect(page.getByTestId('reader')).toBeVisible()
    await page.getByTestId('tab').nth(1).click()
    await expect(page).toHaveURL(/atta-dn-1-1/)
    await page.getByTestId('tab-close').nth(1).click()
    await expect(page.getByTestId('tab-bar')).toHaveCount(0)
    await expect(page).toHaveURL(/\/latn\/dn-1-1/)
  })

  test('in the tabs view links open new tabs, the same text is not opened twice', async ({ page }) => {
    await page.goto('/latn/settings')
    await page.getByTestId('tabview-tabbed').click()
    await page.goto('/latn/dn-1-1')
    await page.goto('/latn/dn-1-2')
    await expect(page.getByTestId('tab')).toHaveCount(2)
    await page.goto('/latn/dn-1-1')
    await expect(page.getByTestId('tab')).toHaveCount(2)
    await expect(page.getByTestId('tab').first()).toHaveAttribute('aria-selected', 'true')
    // tabs survive a reload
    await page.reload()
    await expect(page.getByTestId('tab')).toHaveCount(2)
    // single view keeps one text
    await page.goto('/latn/settings')
    await page.getByTestId('tabview-single').click()
    await page.goto('/latn/dn-1-2')
    await expect(page.getByTestId('tab-bar')).toHaveCount(0)
  })
})
