import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'Test1234!'

const UNSEAT_BUTTON = /^Retirer /
const ANY_TEXT = /\S/
const NODE_IN_URL = /node=\d+/

// These run against whatever the environment was seeded with, so each one skips rather than
// fails when its precondition is absent — the convention the other specs in this directory use.

test.describe('organigram', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    test.skip(!loggedIn, 'no seeded account to log in with')
    await page.goto('/congregation/roles/organigram')
    test.skip(page.url().includes('/login'), 'account cannot reach the organigram')
  })

  test('the chart is read-only — every mutation lives in the node panel', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Organigramme' })).toBeVisible()
    // No destructive control sits in the chart itself, so nothing can be hit while scrolling.
    await expect(page.getByRole('button', { name: UNSEAT_BUTTON })).toHaveCount(0)
  })

  test('an empty chart still offers a way to start one', async ({ page }) => {
    const isEmpty = await page.getByText('Aucun rôle dans l’organigramme').isVisible()
    test.skip(!isEmpty, 'this congregation already has a chart')

    // Without this the congregation is stuck: no node means no panel, and the panel is the only
    // other place a role can be added.
    await expect(page.locator('#root-add-role')).toBeVisible()
  })

  test('selecting a node opens its panel, and the selection survives a reload', async ({ page }) => {
    const firstNode = page.getByRole('link').filter({ hasText: ANY_TEXT })
    test.skip((await firstNode.count()) === 0, 'no chart to select from')

    await firstNode.first().click()
    await expect(page).toHaveURL(NODE_IN_URL)

    // Selection lives in the URL precisely so a form post does not close the panel.
    await page.reload()
    await expect(page).toHaveURL(NODE_IN_URL)
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible()
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
