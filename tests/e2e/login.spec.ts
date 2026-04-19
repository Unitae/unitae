import { expect, test } from '@playwright/test'

const CONNEXION_RE = /connexion/i
const LOGIN_RE = /\/login/
const EMAIL_RE = /email/i
const PASSWORD_RE = /mot de passe/i

test.describe('Connexion', () => {
  test('affiche la page de connexion', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: CONNEXION_RE })).toBeVisible()
  })

  test('redirige vers /login quand non authentifié', async ({ page }) => {
    await page.goto('/board')
    await expect(page).toHaveURL(LOGIN_RE)
  })

  test('affiche une erreur pour des identifiants invalides', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(EMAIL_RE).fill('invalid@example.com')
    await page.getByLabel(PASSWORD_RE).fill('wrongpassword')
    await page.getByRole('button', { name: CONNEXION_RE }).click()
    await expect(page).toHaveURL(LOGIN_RE)
  })
})
