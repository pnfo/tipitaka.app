import { expect, test } from '@playwright/test'
import { paraOptions, wordPoint } from './helpers'

// places and people (dev-docs/names.md): the setting of a sutta from the paragraph menu, the names pages
// (fixture: DN 1 "antarā ca rājagahaṃ antarā ca nāḷandaṃ", MN 1.1, Dhp 1 with its Dhp-a stories)
test.describe('names', () => {
  test('the setting of a sutta, and the other suttas taught at the same place', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    const reader = page.getByTestId('reader')
    await paraOptions(page, reader.locator('.para.bodytext').first())
    await page.getByTestId('para-menu').getByTestId('menu-setting').click()
    const panel = page.getByTestId('study-panel')
    await expect(panel.getByTestId('panel-tab-info')).toBeVisible()
    const place = panel.getByTestId('setting-place')
    await expect(place.getByTestId('setting-name')).toHaveText([/Rājagaha/, /Nāḷandā/])
    await place.getByTestId('setting-name').first().click()
    await expect(page).toHaveURL(/\/latn\/names\/rajagaha$/)
    await expect(page.getByTestId('entity-name')).toHaveText('Rājagaha')
    // in book order: the Vinaya, then DN 1 and DN 2
    await expect(page.getByTestId('entity-place').getByTestId('entity-setting')).toHaveText([/Dutiyapārājikaṃ/, /Brahmajālasuttaṃ/, /Sāmaññaphalasuttaṃ/])
  })

  test('the Setting tab follows the active text: new tabs, switching tabs, a book or vagga opened at its top', async ({ page }) => {
    await page.goto('/latn/settings')
    await page.getByTestId('tabview-tabbed').click()
    await page.goto('/latn/mn-1-1-2')
    await paraOptions(page, page.getByTestId('reader').locator('.para.bodytext').first())
    await page.getByTestId('para-menu').getByTestId('menu-setting').click()
    const panel = page.getByTestId('study-panel')
    const places = panel.getByTestId('setting-place').getByTestId('setting-name')
    await expect(places).toHaveText([/Sāvatthī/, /Jetavana/])
    // new tabs from title suggestions. A book or vagga page starts with headings that belong to no sutta (Namo tassa,
    // the nikāya, the book, the vagga): the setting is that of the first sutta, whose first line names the place
    const open = async (q: string, title: string) => {
      await page.getByTestId('search-input').fill(q)
      await page.getByTestId('search-menu').getByRole('option', { name: new RegExp(`^${title}`) }).click() // (not one under it)
    }
    await open('sīlakkhandha', 'Sīlakkhandhavaggapāḷi')
    await expect(page.getByTestId('tab')).toHaveCount(2)
    await expect(places).toHaveText([/Rājagaha/, /Nāḷandā/])
    await open('mūlapariyāyavagg', '1. Mūlapariyāyavaggo')
    await expect(page.getByTestId('tab')).toHaveCount(3)
    await expect(places).toHaveText([/Ukkaṭṭhā/, /Subhagavana/])
    // switching tabs
    await page.getByTestId('tab').first().click()
    await expect(places).toHaveText([/Sāvatthī/, /Jetavana/])
    await page.getByTestId('tab').nth(1).click()
    await expect(places).toHaveText([/Rājagaha/, /Nāḷandā/])
    // closing the active tab: the setting of the one that becomes active
    await page.getByTestId('tab-close').nth(1).click()
    await expect(page.getByTestId('tab')).toHaveCount(2)
    await expect(places).not.toHaveText([/Rājagaha/, /Nāḷandā/])
    await expect(panel.getByTestId('setting-empty')).toHaveCount(0)
  })

  test('a Dhammapada verse has the setting of its commentary story', async ({ page }) => {
    await page.goto('/latn/kn-dhp-1')
    const verse = page.getByTestId('reader').locator('.para', { hasText: 'Manopubbaṅgamā' }).first()
    await paraOptions(page, verse)
    await page.getByTestId('para-menu').getByTestId('menu-setting').click()
    const panel = page.getByTestId('study-panel')
    await expect(panel.getByTestId('setting-view')).toContainText('Cakkhupālattheravatthu')
    await expect(panel.getByTestId('setting-place').getByTestId('setting-name')).toHaveText([/Sāvatthī/])
    await expect(panel.getByTestId('setting-about').getByTestId('setting-name')).toHaveText([/Cakkhupāla/])
    await expect(panel.getByTestId('setting-note')).toContainText('From the commentary')
  })

  test('the names index filters by type and name', async ({ page }) => {
    await page.goto('/latn/names')
    const list = page.getByTestId('names-list')
    await expect(list.locator('li').first()).toContainText('Sāvatthī')
    await page.getByTestId('names-filter').fill('jeta')
    await expect(list.locator('li')).toHaveCount(1)
    await list.locator('li a').click()
    await expect(page.getByTestId('entity-name')).toHaveText('Jetavana')
    await expect(page.getByTestId('entity-related')).toContainText('Sāvatthī')
  })

  test('maps: the setting of a sutta, a name page, the journey of DN 16', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    await paraOptions(page, page.getByTestId('reader').locator('.para.bodytext').first())
    await page.getByTestId('para-menu').getByTestId('menu-setting').click()
    const panel = page.getByTestId('study-panel')
    // Rājagaha and Nāḷandā on the map of the setting
    await expect(panel.getByTestId('place-map').locator('.tm-main')).toHaveCount(2)
    await panel.getByTestId('setting-map-link').click()
    await expect(page).toHaveURL(/\/latn\/map\?place=rajagaha/)
    await expect(page.getByTestId('map-card-name')).toHaveText('Rājagaha')
    await expect(page.getByTestId('map-card')).toContainText('Brahmajālasuttaṃ')

    await page.goto('/latn/names/savatthi')
    await expect(page.getByTestId('entity-map').locator('.tm-main')).toHaveCount(1)

    await page.goto('/latn/map')
    await page.getByTestId('map-journey-mahaparinibbana').click()
    const stops = page.getByTestId('map-journey-stops').locator('li')
    await expect(stops).toHaveCount(14)
    await expect(stops.first()).toContainText('Rājagaha')
    await expect(stops.last()).toContainText('Kusinārā')
    await expect(page.locator('.tm-stop')).toHaveCount(14)
  })

  test('mentions: the names of a paragraph, every mention of a name', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    await paraOptions(page, page.getByTestId('reader').locator('.para.bodytext').first())
    await page.getByTestId('para-menu').getByTestId('menu-setting').click()
    const named = page.getByTestId('study-panel').getByTestId('setting-named')
    await expect(named.getByTestId('named-name').filter({ hasText: 'Suppiya' })).toHaveCount(1)
    await named.getByTestId('named-name').filter({ hasText: 'Brahmadatta' }).click()
    await expect(page).toHaveURL(/\/latn\/names\/brahmadatta-5$/)
    // the mentions by book, loaded when a book is opened
    const mentions = page.getByTestId('entity-mentions')
    await mentions.getByTestId('mention-book').first().locator('summary').click()
    await expect(mentions.getByTestId('mention').first()).toContainText(/brahmadatt/i)
    await expect(mentions.getByTestId('mention').first().locator('mark')).toHaveText(/^brahmadatt/i)
    await expect(page.getByTestId('entity-comentions')).toContainText('Suppiya')
  })

  test('the Setting tab follows a tapped word; the map page opens on the place; satellite view', async ({ page }) => {
    await page.goto('/latn/dn-1-1')
    await page.getByTestId('reader').locator('.gl', { hasText: 'sambahulānaṃ' }).first().scrollIntoViewIfNeeded()
    const at = await wordPoint(page, 'sambahulānaṃ')
    await page.mouse.click(at.x, at.y)
    const panel = page.getByTestId('study-panel')
    await panel.getByTestId('panel-tab-info').click()
    await expect(panel.getByTestId('setting-place').getByTestId('setting-name')).toHaveText([/Rājagaha/, /Nāḷandā/])
    await panel.getByTestId('setting-map-link').click()
    await expect(page.getByTestId('map-card-name')).toHaveText('Rājagaha')
    // the satellite view: the imagery under the places
    await page.getByTestId('map-base-satellite').click()
    await expect(page.locator('.leaflet-tile-pane img[src*="s2cloudless"]').first()).toBeAttached()
    await page.getByTestId('map-base-drawn').click()
    await expect(page.locator('.leaflet-tile-pane img')).toHaveCount(0)
  })

  test('a place without coordinates has no map', async ({ page }) => {
    await page.goto('/latn/names/vehapphala-1')
    await expect(page.getByTestId('entity-name')).toHaveText('Vehapphala')
    await expect(page.getByTestId('entity-mentions')).toBeVisible()
    await expect(page.getByTestId('entity-map')).toHaveCount(0)
  })

  test('the Setting tab follows the active tab', async ({ page }) => {
    await page.goto('/latn/settings')
    await page.getByTestId('tabview-tabbed').click()
    await page.goto('/latn/mn-1-1-1') // at Ukkaṭṭhā
    await page.goto('/latn/mn-1-1-2') // at Sāvatthī
    await expect(page.getByTestId('tab')).toHaveCount(2)
    await paraOptions(page, page.getByTestId('reader').locator('.para.bodytext').first())
    await page.getByTestId('para-menu').getByTestId('menu-setting').click()
    const place = page.getByTestId('study-panel').getByTestId('setting-place').getByTestId('setting-name')
    await expect(place.first()).toContainText('Sāvatthī')
    await page.getByTestId('tab').first().click()
    await expect(place.first()).toContainText('Ukkaṭṭhā')
    await page.getByTestId('tab').nth(1).click()
    await expect(place.first()).toContainText('Sāvatthī')
  })
})
