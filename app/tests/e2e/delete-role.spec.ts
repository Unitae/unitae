import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'Test1234!'

const EDIT_URL = /\/congregation\/roles\/\d+\/edit/
const ROLES_URL = /\/congregation\/roles(\?.*)?$/
const CREATE_BUTTON = /Créer|Enregistrer/
const NAME_FIELD = /nom/i

// The delete confirmation used to send nothing at all.
//
// `AlertDialogAction` closes the dialog on click, which unmounted the `<Form>` that lived inside
// the dialog before the browser reached the button's default submit. No request, no error, no
// change — the dialog just closed and the role stayed. Nothing below the browser can catch that:
// the action was never reached, so no server-side test would have failed.
//
// This test creates the role it deletes, and must keep doing so. An earlier version picked the
// first role on the page instead, which meant every run destroyed real data in whatever database
// it was pointed at — it removed three services from the development congregation before anyone
// noticed. A test for a destructive action has to bring its own subject.

test.describe('deleting a role', () => {
  test('the confirmation actually sends a request', async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    test.skip(!loggedIn, 'no seeded account to log in with')

    await page.goto('/congregation/roles/new')
    test.skip(page.url().includes('/login'), 'account cannot create roles')

    // A name nothing else will collide with, so the run is repeatable and self-cleaning.
    const name = `E2E delete probe ${Date.now()}`
    await page.getByLabel(NAME_FIELD).first().fill(name)
    await page.getByRole('button', { name: CREATE_BUTTON }).click()
    await page.waitForURL(ROLES_URL)

    await page.getByRole('link', { name }).first().click()
    await page.waitForURL(EDIT_URL)

    const posts: string[] = []
    page.on('request', request => {
      if (request.method() === 'POST') posts.push(request.url())
    })

    await page.getByRole('button', { name: 'Supprimer le rôle' }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()

    await expect.poll(() => posts.filter(url => url.includes('/delete')).length, { timeout: 5000 }).toBeGreaterThan(0)

    // The probe role carries nothing and has no children, so the delete must go through — which
    // also leaves the database as the test found it.
    await page.goto('/congregation/roles')
    await expect(page.getByRole('link', { name })).toHaveCount(0)
  })
})
