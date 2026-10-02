import { expect, test } from '@playwright/test'

test.describe('server side rendering (no javascript)', () => {
  test.use({ javaScriptEnabled: false })

  test('text pages are readable and have seo tags', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    await expect(page.locator('article#ssr')).toContainText('Evaṃ me sutaṃ')
    await expect(page).toHaveTitle('1. Brahmajālasuttaṃ – Sīlakkhandhavaggapāḷi | Tipiṭaka.app')
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://tipitaka.app/latn/dn-1-1')
    await expect(page.locator('link[hreflang="pi-Mymr"]')).toHaveAttribute('href', 'https://tipitaka.app/mymr/dn-1-1')
    await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /Evaṃ me sutaṃ/)
    await expect(page.locator('h1')).toHaveText('1. Brahmajālasuttaṃ')
  })

  test('other scripts are rendered converted', async ({ page }) => {
    await page.goto('/thai/dn-1-1')
    await expect(page.locator('html')).toHaveAttribute('lang', 'pi-Thai')
    await expect(page.locator('article#ssr')).not.toContainText('Evaṃ')
  })

  test('v2 share links redirect', async ({ request }) => {
    const res = await request.get('/?a=aa1-4-si', { maxRedirects: 0 })
    expect(res.status()).toBe(301)
    expect(res.headers().location).toMatch(/^\/sinh\/dn-1-1#p\d+$/)
  })

  test('sitemaps and robots', async ({ request }) => {
    expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap:')
    const sm = await (await request.get('/sitemaps/latn.xml')).text()
    expect(sm).toContain('/latn/dn-1-1</loc>')
  })
})
