import { expect, type Page, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

// The look chosen for a board document on its edit page is the one its viewer shows. Runs against
// whatever the environment was seeded with: it skips without a dynamic document, and puts the
// document's look back as it found it.

const DYNAMIC_EDIT_LINK = 'a[href^="/board/dynamic/"][href$="/edit"]'
const DOCUMENT_ID = /\/board\/dynamic\/(\d+)\/edit/
const SAVE_BUTTON = /Modifier le document|Update document/i

async function checkedValue(page: Page, name: string): Promise<string | null> {
  const checked = page.locator(`button[role="radio"][id^="appearance-${name}-"][data-state="checked"]`)
  if ((await checked.count()) === 0) return null
  return (await checked.getAttribute('value')) ?? null
}

async function choose(page: Page, choices: Record<string, string | null>) {
  for (const [name, value] of Object.entries(choices)) {
    if (value) await page.locator(`#appearance-${name}-${value}`).click()
  }
  await page.getByRole('button', { name: SAVE_BUTTON }).click()
  await page.waitForLoadState('networkidle')
}

test.describe('board document appearance', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)
    test.skip(!loggedIn, 'no seeded account to log in with')
  })

  test('the viewer shows a document in the typeface and layout chosen for it', async ({ page }) => {
    await page.goto('/board/documents')
    const edit = page.locator(DYNAMIC_EDIT_LINK)
    test.skip((await edit.count()) === 0, 'no dynamic document to style')
    const href = (await edit.first().getAttribute('href')) ?? ''
    const id = DOCUMENT_ID.exec(href)?.[1]

    await page.goto(href)
    const original = {
      typeface: await checkedValue(page, 'typeface'),
      accent: await checkedValue(page, 'accent'),
      layout: await checkedValue(page, 'layout'),
    }
    // A document with a single layout (the programme) offers no choice of layout.
    const layouts = page.locator('button[role="radio"][id^="appearance-layout-"]')
    const layout = (await layouts.count()) > 1 ? await layouts.last().getAttribute('value') : null

    await choose(page, { typeface: 'serif', accent: 'black', layout })
    try {
      await page.goto(`/board/dynamic/${id}/viewer`)
      const sheet = page.locator('[data-board-sheet]')
      expect(await sheet.evaluate(element => getComputedStyle(element).fontFamily)).toContain('Source Serif 4')
      if (layout) await expect(sheet).toHaveAttribute('data-layout', layout)
    } finally {
      await page.goto(href)
      await choose(page, original)
    }
  })
})
