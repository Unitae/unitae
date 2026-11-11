import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

const TEST_EMAIL = E2E_ADMIN_EMAIL
const TEST_PASSWORD = E2E_ADMIN_PASSWORD
const REGISTRY_URL_RE = /\/programs\/external-speakers/
const NEW_SPEAKER_URL_RE = /\/programs\/external-speakers\?new/
const CONGREGATION_URL_RE = /\?congregation=\d+/

test.describe('External speakers registry', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('registry page loads at /programs/external-speakers', async ({ page }) => {
    await page.goto('/programs/external-speakers')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(REGISTRY_URL_RE)
    await expect(page.getByRole('heading', { name: 'Orateurs extérieurs' }).first()).toBeVisible()
  })

  // The old « Ajouter » page now opens the new-speaker form in the list's panel.
  test('the old add-speaker address opens the form in the panel', async ({ page }) => {
    await page.goto('/programs/external-speakers/new')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(NEW_SPEAKER_URL_RE)
    await expect(page.getByLabel('Prénom et nom')).toBeVisible()
    await expect(page.getByLabel('Assemblée', { exact: true })).toBeVisible()
  })

  test('a new congregation is created from the dialog and opens in the panel', async ({ page }) => {
    const name = `E2E ${Date.now()}`
    await page.goto('/programs/external-speakers')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Nouvelle assemblée' }).first().click()
    await page.getByRole('dialog').getByLabel('Nom').fill(name)
    await page.getByRole('dialog').getByRole('button', { name: 'Créer', exact: true }).click()
    await expect(page).toHaveURL(CONGREGATION_URL_RE)
    await expect(page.getByRole('heading', { name })).toBeVisible()
  })
})

const OUR_LIST_URL_RE = /\/programs\/external-speakers\/ours/
const OUR_LIST_TAB_RE = /Notre liste/
const OUR_LIST_STATE_RE = /Candidats : les \d+ frères du rôle|Notre liste n’est pas encore réglée/

// « Notre liste »: read-only checks, so the spec never changes the list a local run points at.
test.describe('Our list of speakers', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('the « Notre liste » tab opens the list we send', async ({ page }) => {
    await page.goto('/programs/external-speakers')
    await page.waitForLoadState('networkidle')
    await page
      .getByRole('navigation', { name: 'Listes d’orateurs' })
      .getByRole('link', { name: OUR_LIST_TAB_RE })
      .click()
    await expect(page).toHaveURL(OUR_LIST_URL_RE)
    // Either the list, or — until a role is chosen in Réglages — the way to set it up.
    await expect(page.getByText(OUR_LIST_STATE_RE).first()).toBeVisible()
  })

  test('Réglages offers the role of the candidates and of the public talk coordinator', async ({ page }) => {
    await page.goto('/settings/external-speakers')
    await page.waitForLoadState('networkidle')
    await expect(page.getByLabel('Candidats pour notre liste')).toBeVisible()
    await expect(page.getByLabel('Responsable des discours publics')).toBeVisible()
  })
})
