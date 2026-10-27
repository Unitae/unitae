import { type Page, test } from '@playwright/test'

// The admin account app-setup.spec.ts creates on the CI database (override both for another
// environment). One source, so a spec cannot drift to a password that was never set.
export const E2E_ADMIN_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
export const E2E_ADMIN_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'Str0ng-E2E-Passphrase-42'

const EMAIL_RE = /email/i
const PASSWORD_RE = /mot de passe/i
const LOGIN_RE = /connexion/i

// CI starts from a fresh database on which app-setup.spec.ts creates the admin account. There, a
// missing account or a failed login means setup or authentication is broken, and skipping would
// leave CI green while most of the suite never runs. Locally, against an arbitrary database, the
// helpers still let a spec skip.
const IN_CI = Boolean(process.env.CI)

/**
 * Logs in via the UI login form.
 * Returns true if login succeeded, false if login page was not available
 * (e.g., app redirected to /setup because no users exist). In CI a failed login throws instead.
 */
export async function login(page: Page, email: string, password: string): Promise<boolean> {
  const loggedIn = await submitLogin(page, email, password)
  if (!loggedIn && IN_CI) {
    throw new Error(
      `E2E login failed for ${email} (now on ${page.url()}). In CI, app-setup.spec.ts must have created ` +
        'this account: setup or authentication is broken.',
    )
  }
  return loggedIn
}

/**
 * Skips the test when the instance has no account yet (the app redirects to /setup or /register).
 * In CI the setup project initialises the instance, so being redirected there is a failure.
 */
export function skipUnlessInitialised(page: Page): void {
  const uninitialised = page.url().includes('/setup') || page.url().includes('/register')
  if (uninitialised && IN_CI) {
    throw new Error(`Redirected to ${page.url()}: in CI, app-setup.spec.ts must have initialised the instance.`)
  }
  test.skip(uninitialised, 'instance not initialised yet (no account)')
}

async function submitLogin(page: Page, email: string, password: string): Promise<boolean> {
  await page.goto('/login')

  // If no users exist, the app redirects to /setup or /register
  if (page.url().includes('/setup') || page.url().includes('/register')) {
    return false
  }

  const emailField = page.getByLabel(EMAIL_RE)
  if (!(await emailField.isVisible({ timeout: 3000 }).catch(() => false))) {
    return false
  }

  await emailField.fill(email)
  await page.getByLabel(PASSWORD_RE).fill(password)
  await page.getByRole('button', { name: LOGIN_RE }).click()

  // Wait for navigation away from login (max 10s)
  try {
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10_000 })
    return true
  } catch {
    return false
  }
}
