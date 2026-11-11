import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

const TEST_EMAIL = E2E_ADMIN_EMAIL
const TEST_PASSWORD = E2E_ADMIN_PASSWORD

const ROLE_IN_URL = /role=\d+/

// Deleting a role must actually send the request — a confirmation that closed without posting once let a role
// survive its own deletion, and nothing below the browser could see it.
//
// This test creates the role it deletes, and must keep doing so. An earlier version picked the first role on the
// page, which meant every run destroyed real data in whatever database it was pointed at. A test for a destructive
// action has to bring its own subject. Created outside the chart, it never touches the congregation's organigram.

test.describe('deleting a role', () => {
  test('the confirmation sends the deletion, and the role is gone', async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    test.skip(!loggedIn, 'no seeded account to log in with')

    await page.goto('/congregation/roles/organigram?new=1')
    test.skip(page.url().includes('/login'), 'account cannot reach the organigram')
    // The dialog opens once the page has loaded; an account that cannot create roles never sees it.
    const dialog = page.getByRole('dialog', { name: 'Nouveau rôle' })
    const opened = await dialog.waitFor({ timeout: 10_000 }).then(
      () => true,
      () => false,
    )
    test.skip(!opened, 'account cannot create roles')

    // A name nothing else will collide with, so the run is repeatable and self-cleaning.
    const name = `E2E delete probe ${Date.now()}`
    await dialog.getByLabel('Nom', { exact: true }).fill(name)
    await dialog.getByRole('button', { name: 'Créer le rôle' }).click()

    // The new role's panel opens next.
    await expect(page).toHaveURL(ROLE_IN_URL)
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()

    const posts: string[] = []
    page.on('request', request => {
      if (request.method() === 'POST') posts.push(request.postData() ?? '')
    })

    await page.getByRole('button', { name: 'Modifier' }).click()
    await page.getByRole('button', { name: 'Supprimer le rôle' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer le rôle' }).click()

    await expect.poll(() => posts.filter(body => body.includes('delete')).length, { timeout: 5000 }).toBeGreaterThan(0)
    // The probe carries nothing and reserves nothing, so the deletion goes through — leaving the database as the
    // test found it.
    await expect(page.getByRole('heading', { level: 2, name })).toHaveCount(0)
    await page.goto('/congregation/roles')
    await expect(page.getByRole('link', { name })).toHaveCount(0)
  })
})
