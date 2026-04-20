import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

const SETTINGS_HEADING_RE = /paramètres|réglages|configuration/i
const SETTINGS_USERS_URL_RE = /\/settings\/users/
const ADD_USER_RE = /ajouter|nouveau|créer/i
const EMAIL_RE = /email/i
const SETTINGS_CONGREGATION_URL_RE = /\/settings\/congregation/
const SETTINGS_TERRITORIES_URL_RE = /\/settings\/territories/

test.describe('Parametres', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_EMAIL, TEST_PASSWORD)
  })

  test('affiche la page des parametres', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: SETTINGS_HEADING_RE })).toBeVisible()
  })

  test('affiche la liste des utilisateurs', async ({ page }) => {
    await page.goto('/settings/users')
    await expect(page).toHaveURL(SETTINGS_USERS_URL_RE)
  })

  test("accede au formulaire de creation d'utilisateur", async ({ page }) => {
    await page.goto('/settings/users')
    const addLink = page.getByRole('link', { name: ADD_USER_RE })
    if (await addLink.isVisible()) {
      await addLink.click()
      await expect(page.getByLabel(EMAIL_RE)).toBeVisible()
    }
  })

  test('affiche les parametres de la congregation', async ({ page }) => {
    await page.goto('/settings/congregation')
    await expect(page).toHaveURL(SETTINGS_CONGREGATION_URL_RE)
  })

  test('affiche les parametres des territoires', async ({ page }) => {
    await page.goto('/settings/territories')
    await expect(page).toHaveURL(SETTINGS_TERRITORIES_URL_RE)
  })
})
