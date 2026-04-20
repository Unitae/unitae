import { expect, test } from '@playwright/test'

const EMAIL_RE = /email/i
const ENVOYER_RE = /envoyer/i
const FORGOT_URL_RE = /\/password\/forgot/
const RETOUR_CONNEXION_RE = /retour.*connexion/i
const LOGIN_RE = /\/login/

test.describe('Mot de passe oublié', () => {
  test('affiche la page de mot de passe oublié', async ({ page }) => {
    await page.goto('/password/forgot')
    await expect(page.getByLabel(EMAIL_RE)).toBeVisible()
    await expect(page.getByRole('button', { name: ENVOYER_RE })).toBeVisible()
  })

  test("affiche un message de succès après soumission d'un email", async ({ page }) => {
    await page.goto('/password/forgot')
    await page.getByLabel(EMAIL_RE).fill('test@example.com')
    await page.getByRole('button', { name: ENVOYER_RE }).click()
    await expect(page).toHaveURL(FORGOT_URL_RE)
  })

  test('permet de naviguer vers la page de connexion', async ({ page }) => {
    await page.goto('/password/forgot')
    await page.getByRole('link', { name: RETOUR_CONNEXION_RE }).click()
    await expect(page).toHaveURL(LOGIN_RE)
  })
})
