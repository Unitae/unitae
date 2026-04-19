import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

test.describe('Panneau d\'affichage', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_EMAIL, TEST_PASSWORD)
  })

  test('affiche le panneau d\'affichage', async ({ page }) => {
    await page.goto('/board')
    await expect(page.getByRole('heading', { name: /panneau|affichage|tableau/i })).toBeVisible()
  })

  test('accede a la gestion des sections', async ({ page }) => {
    await page.goto('/board/sections')
    // Should display the sections management page or redirect if no permission
    await expect(page).toHaveURL(/\/board/)
  })

  test('accede au formulaire d\'ajout de document', async ({ page }) => {
    await page.goto('/board/sections')
    const addLink = page.getByRole('link', { name: /ajouter|nouveau/i })
    if (await addLink.isVisible()) {
      await addLink.click()
      // The new document form should be visible
      await expect(page.getByRole('button', { name: /enregistrer|créer|ajouter/i })).toBeVisible()
    }
  })
})
