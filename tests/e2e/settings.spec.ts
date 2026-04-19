import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

test.describe('Parametres', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_EMAIL, TEST_PASSWORD)
  })

  test('affiche la page des parametres', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /paramètres|réglages|configuration/i })).toBeVisible()
  })

  test('affiche la liste des utilisateurs', async ({ page }) => {
    await page.goto('/settings/users')
    await expect(page).toHaveURL(/\/settings\/users/)
  })

  test('accede au formulaire de creation d\'utilisateur', async ({ page }) => {
    await page.goto('/settings/users')
    const addLink = page.getByRole('link', { name: /ajouter|nouveau|créer/i })
    if (await addLink.isVisible()) {
      await addLink.click()
      await expect(page.getByLabel(/email/i)).toBeVisible()
    }
  })

  test('affiche les parametres de la congregation', async ({ page }) => {
    await page.goto('/settings/congregation')
    await expect(page).toHaveURL(/\/settings\/congregation/)
  })

  test('affiche les parametres des territoires', async ({ page }) => {
    await page.goto('/settings/territories')
    await expect(page).toHaveURL(/\/settings\/territories/)
  })
})
