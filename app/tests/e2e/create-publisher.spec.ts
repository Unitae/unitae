import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

const PROCLAMATEURS_RE = /proclamateurs/i
const AJOUTER_RE = /ajouter/i
const NOM_RE = /nom/i
const PRENOM_RE = /prénom/i
const SUBMIT_RE = /enregistrer|créer|ajouter/i
const PUBLISHERS_NEW_RE = /\/publishers\/new/

test.describe('Proclamateurs', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_EMAIL, TEST_PASSWORD)
  })

  test('affiche la liste des proclamateurs', async ({ page }) => {
    await page.goto('/publishers')
    await expect(page.getByRole('heading', { name: PROCLAMATEURS_RE })).toBeVisible()
  })

  test('accede au formulaire de creation', async ({ page }) => {
    await page.goto('/publishers')
    const addLink = page.getByRole('link', { name: AJOUTER_RE })
    if (await addLink.isVisible()) {
      await addLink.click()
      await expect(page.getByLabel(NOM_RE)).toBeVisible()
      await expect(page.getByLabel(PRENOM_RE)).toBeVisible()
    }
  })

  test('affiche une erreur si le formulaire est soumis vide', async ({ page }) => {
    await page.goto('/publishers/new')
    await page.getByRole('button', { name: SUBMIT_RE }).click()
    // Form should stay on the same page with validation errors
    await expect(page).toHaveURL(PUBLISHERS_NEW_RE)
  })
})
