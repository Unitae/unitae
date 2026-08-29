import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'Test1234!'

const EDIT_URL = /\/congregation\/roles\/\d+\/edit/

// The delete confirmation used to send nothing at all.
//
// `AlertDialogAction` closes the dialog on click, which unmounted the `<Form>` that lived inside
// the dialog before the browser reached the button's default submit. No request, no error, no
// change — the dialog just closed and the role stayed. Nothing below the browser can catch that:
// the action was never reached, so no server-side test would have failed.
//
// Runs against whatever the environment was seeded with, so it skips rather than fails when its
// precondition is absent — the convention the other specs in this directory use.

test.describe('deleting a role', () => {
  test('the confirmation actually sends a request', async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    test.skip(!loggedIn, 'no seeded account to log in with')

    await page.goto('/congregation/roles')
    test.skip(page.url().includes('/login'), 'account cannot reach the roles page')

    // The matrix reaches a role's edit page through the pencil on its column header, which is
    // a link to ./<id>/edit rather than a labelled control.
    const firstRole = page.locator('a[href*="/edit"]').first()
    test.skip((await firstRole.count()) === 0, 'this congregation has no custom role to edit')
    await firstRole.click()
    await page.waitForURL(EDIT_URL)

    const posts: string[] = []
    page.on('request', request => {
      if (request.method() === 'POST') posts.push(request.url())
    })

    await page.getByRole('button', { name: 'Supprimer le rôle' }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()

    // Deliberately asserts the request, not the outcome: whether the role is then deleted or
    // refused depends on the seed, but sending nothing is always the bug.
    await expect.poll(() => posts.filter(url => url.includes('/delete')).length, { timeout: 5000 }).toBeGreaterThan(0)
  })
})
