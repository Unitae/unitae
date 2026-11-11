import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

const TEST_EMAIL = E2E_ADMIN_EMAIL
const TEST_PASSWORD = E2E_ADMIN_PASSWORD

const UNSEAT_BUTTON = /^Retirer /
const ROLE_IN_URL = /role=\d+/
const ROOT_ADD = /^Remettre « .+ » en haut$/

// These run against whatever the environment was seeded with, so each one skips rather than
// fails when its precondition is absent — the convention the other specs in this directory use.

test.describe('organigram', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    test.skip(!loggedIn, 'no seeded account to log in with')
    await page.goto('/congregation/roles/organigram')
    test.skip(page.url().includes('/login'), 'account cannot reach the organigram')
  })

  test('the chart is read-only — every change lives in the role panel', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Organigramme' })).toBeVisible()
    // No destructive control sits in the chart itself, so nothing can be hit while scrolling.
    await expect(page.getByRole('button', { name: UNSEAT_BUTTON })).toHaveCount(0)
  })

  test('an empty chart still offers a way to start one', async ({ page }) => {
    const isEmpty = await page.getByText('Aucun rôle dans l’organigramme').isVisible()
    test.skip(!isEmpty, 'this congregation already has a chart')

    // Without this the congregation is stuck: no role means no panel to add one from.
    await expect(page.getByRole('button', { name: ROOT_ADD }).first()).toBeVisible()
  })

  test('selecting a role opens its panel, and the selection survives a reload', async ({ page }) => {
    // Scoped to the chart's own rows, so a sidebar control is never picked by mistake.
    const rows = page.getByRole('region', { name: 'Organigramme de l’assemblée' }).getByRole('button')
    test.skip((await rows.count()) === 0, 'no chart to select from')

    await rows.first().click()
    await expect(page).toHaveURL(ROLE_IN_URL)

    // The selection lives in the address, so a reload or a shared link opens the same panel.
    await page.reload()
    await expect(page).toHaveURL(ROLE_IN_URL)
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
  })

  test('the chart does not scroll sideways on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
