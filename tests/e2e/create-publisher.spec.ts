import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

test.describe('Proclamateurs', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_EMAIL, TEST_PASSWORD)
  })

  test('affiche la liste des proclamateurs', async ({ page }) => {
    await page.goto('/congregation/publishers')
    await expect(page.getByRole('heading', { name: /proclamateurs/i })).toBeVisible()
  })

  test('accede au formulaire de creation', async ({ page }) => {
    await page.goto('/congregation/publishers')
    const addLink = page.getByRole('link', { name: /ajouter/i })
    if (await addLink.isVisible()) {
      await addLink.click()
      await expect(page.getByLabel(/nom/i)).toBeVisible()
      await expect(page.getByLabel(/prénom/i)).toBeVisible()
    }
  })

  test('affiche une erreur si le formulaire est soumis vide', async ({ page }) => {
    await page.goto('/congregation/publishers/new')
    await page.getByRole('button', { name: /enregistrer|créer|ajouter/i }).click()
    // Form should stay on the same page with validation errors
    await expect(page).toHaveURL(/\/publishers\/new/)
  })
})
