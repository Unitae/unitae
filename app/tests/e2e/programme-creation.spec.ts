import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

// Nothing here is saved: the page is checked up to what it would create, so the suite leaves no programme behind.

const SUBMIT_SERIES_RE = /^Créer (\d+) programmes?$/
const ROW_RE = /^Créer .+ du /
const SINGLE_RE = /^Une seule date$/
const OTHER_EVENT_RE = /^Autre évènement/
const SUBMIT_SINGLE_RE = /^Créer le programme$/
const END_ERROR_RE = /Après le début/
const NEW_URL_RE = /\/programs\/new/

function submitCount(label: string | null): number {
  return Number(label?.match(SUBMIT_SERIES_RE)?.[1] ?? Number.NaN)
}

test.describe('Programme creation', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('counts what a series will create, and leaves out a day once unticked', async ({ page }) => {
    await page.goto('/programs/new')
    const submit = page.getByRole('button', { name: SUBMIT_SERIES_RE })
    await submit.waitFor({ state: 'visible' })
    const before = submitCount(await submit.textContent())
    test.skip(!(before > 1), 'needs at least two programmes to create in the default period')

    await page.getByRole('checkbox', { name: ROW_RE }).first().click()

    await expect(submit).toHaveText(`Créer ${before - 1} programme${before - 1 === 1 ? '' : 's'}`)
    await expect(page.locator('input[name="skip"]')).toHaveCount(1)
  })

  test('opens on the week asked for from the programmes list', async ({ page }) => {
    await page.goto('/programs/new?week=2030-01-09')

    // The date fields post their day as YYYY-MM-DD through a hidden input; the visible one writes it out.
    await expect(page.locator('input[type="hidden"][name="from"]')).toHaveValue('2030-01-07')
    await expect(page.locator('input[type="hidden"][name="to"]')).toHaveValue('2030-01-13')
  })

  test('refuses another event that ends before it starts, keeping what was typed', async ({ page }) => {
    await page.goto('/programs/new')
    await page.getByRole('button', { name: SINGLE_RE }).click()
    await page.getByText(OTHER_EVENT_RE).click()
    await page.locator('#creation-name').fill('Nettoyage de la salle')
    // Typed in the reader's order (day, month, year), committed when the field is left.
    await page.locator('#creation-day').fill('12/01/2030')
    await page.locator('#creation-day').press('Tab')
    await page.locator('#creation-start').fill('09:00')
    await page.locator('#creation-end').fill('08:30')
    await page.getByRole('button', { name: SUBMIT_SINGLE_RE }).click()

    await expect(page.getByText(END_ERROR_RE)).toBeVisible()
    await expect(page).toHaveURL(NEW_URL_RE)
    await expect(page.locator('#creation-name')).toHaveValue('Nettoyage de la salle')
  })
})
