import { expect, test } from '@playwright/test'

test.describe('Mot de passe oublié', () => {
  test('affiche la page de mot de passe oublié', async ({ page }) => {
    await page.goto('/password/forgot')
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /envoyer/i })).toBeVisible()
  })

  test("affiche un message de succès après soumission d'un email", async ({ page }) => {
    await page.goto('/password/forgot')
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByRole('button', { name: /envoyer/i }).click()
    await expect(page).toHaveURL(/\/password\/forgot/)
  })

  test('permet de naviguer vers la page de connexion', async ({ page }) => {
    await page.goto('/password/forgot')
    await page.getByRole('link', { name: /retour.*connexion/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})
