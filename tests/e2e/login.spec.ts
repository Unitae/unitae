import { expect, test } from '@playwright/test'

test.describe('Connexion', () => {
  test('affiche la page de connexion', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /connexion/i })).toBeVisible()
  })

  test('redirige vers /login quand non authentifié', async ({ page }) => {
    await page.goto('/board')
    await expect(page).toHaveURL(/\/login/)
  })

  test('affiche une erreur pour des identifiants invalides', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('invalid@example.com')
    await page.getByLabel(/mot de passe/i).fill('wrongpassword')
    await page.getByRole('button', { name: /connexion/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})
