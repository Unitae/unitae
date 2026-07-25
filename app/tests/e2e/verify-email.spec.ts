import 'dotenv/config'

import { expect, test } from '@playwright/test'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../../database/generated/client'

// French UI strings rendered by the confirm route.
const CONFIRM_BUTTON_RE = /confirmer mon adresse/i
const INVALID_TOKEN_RE = /invalide|expiré/i
const LOGIN_URL_RE = /\/login/

const connectionString = process.env.DB_RUNTIME_URL ?? process.env.DB_URL
const ts = Date.now()

test.describe('Email verification confirm flow', () => {
  test('a GET on the confirm route renders a page instead of redirecting', async ({ page }) => {
    // Defensive smoke test — needs no seeded data. An unknown token shows the invalid-token
    // landing page and stays on the URL: the loader renders rather than throwing a redirect.
    await page.goto(`/verify-email/unknown-${ts}`)
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(new RegExp(`/verify-email/unknown-${ts}`))
    await expect(page.getByText(INVALID_TOKEN_RE)).toBeVisible()
  })

  test.describe('with a seeded verification token', () => {
    let db: PrismaClient | undefined
    let seeded = false
    let userId: number | undefined
    let congregationId: number | undefined
    let tokenCounter = 0

    test.beforeAll(async () => {
      if (!connectionString) return

      db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 3, connectionTimeoutMillis: 5000 }) })
      try {
        const congregation = await db.congregation.create({
          data: { name: `E2E Verify ${ts}`, slug: `e2e-verify-${ts}`, active: true },
        })
        congregationId = congregation.id

        const user = await db.userAccount.create({
          data: {
            congregationId: congregation.id,
            email: `verify-${ts}@e2e.test`,
            password: 'not-used-in-this-flow',
            emailVerifiedAt: null,
          },
        })
        userId = user.id
        seeded = true
      } catch {
        // DB unreachable or seeding blocked (permissions/RLS) — the seeded tests skip below;
        // afterAll cleans up whatever was created.
        seeded = false
      }
    })

    test.afterAll(async () => {
      if (db && userId != null) await db.userAccount.delete({ where: { id: userId } }).catch(() => {})
      if (db && congregationId != null) await db.congregation.delete({ where: { id: congregationId } }).catch(() => {})
      await db?.$disconnect().catch(() => {})
    })

    async function seedToken(client: PrismaClient, uid: number): Promise<string> {
      const token = `e2e-token-${ts}-${tokenCounter++}`
      await client.emailVerificationToken.create({
        data: { token, userId: uid, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      })
      return token
    }

    test('a GET does not consume the token (prefetch-safe)', async ({ page }) => {
      test.skip(!seeded, 'no database connection to seed a verification token')
      if (!db || userId == null) return

      const token = await seedToken(db, userId)

      // Simulate a link-prefetcher loading the URL.
      await page.goto(`/verify-email/${token}`)
      await page.waitForLoadState('networkidle')

      // The confirm button is shown (valid token) — no auto-redirect, no consume.
      await expect(page.getByRole('button', { name: CONFIRM_BUTTON_RE })).toBeVisible()

      // The token survived the GET.
      const stillValid = await db.emailVerificationToken.findUnique({ where: { token } })
      expect(stillValid).not.toBeNull()
    })

    test('clicking Confirm consumes the token and verifies the email', async ({ page }) => {
      test.skip(!seeded, 'no database connection to seed a verification token')
      if (!db || userId == null) return

      const token = await seedToken(db, userId)

      await page.goto(`/verify-email/${token}`)
      await page.getByRole('button', { name: CONFIRM_BUTTON_RE }).click()

      // An anonymous confirmation redirects to the login page.
      await page.waitForURL(LOGIN_URL_RE, { timeout: 10_000 })

      // The token is burnt and the account is now verified.
      const consumed = await db.emailVerificationToken.findUnique({ where: { token } })
      expect(consumed).toBeNull()

      const account = await db.userAccount.findUnique({ where: { id: userId } })
      expect(account?.emailVerifiedAt).not.toBeNull()
    })
  })
})
