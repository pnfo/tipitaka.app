import { expect, type Locator, type Page } from '@playwright/test'

/** opens the options menu of a paragraph: through its ⋯ button (shown on hover), or on touch screens with a tap at
 *  the start of its first line (the number / indent / margin there opens the options) */
export async function paraOptions(page: Page, para: Locator) {
  const wrap = para.locator('xpath=..')
  const dots = wrap.getByTestId('para-options')
  await para.hover()
  if (!(await dots.isVisible())) await para.click({ position: { x: 1, y: 1 } })
  if (!(await page.getByTestId('para-menu').isVisible())) await dots.click()
  await expect(page.getByTestId('para-menu')).toBeVisible()
}

/** opens the menu (components/NavPane.vue): a column on wide screens, else over the page */
export async function openMenu(page: Page): Promise<Locator> {
  const nav = page.getByTestId('nav-pane')
  if (!(await nav.isVisible())) await page.getByTestId('nav-toggle').click()
  await expect(nav).toBeVisible()
  return nav
}

/** the screen point of the middle of the first occurrence of a word in the reader text */
export async function wordPoint(page: Page, word: string): Promise<{ x: number; y: number }> {
  return page.evaluate((w) => {
    const walker = document.createTreeWalker(document.querySelector('[data-testid=reader] .reading')!, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent!.indexOf(w)
      if (i < 0) continue
      const r = document.createRange()
      r.setStart(n, i)
      r.setEnd(n, i + w.length)
      const b = r.getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }
    throw new Error(`no ${w} in the text`)
  }, word)
}
