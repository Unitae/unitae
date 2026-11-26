import { expect, type Page, test } from '@playwright/test'
import { login } from './helpers/auth'

const MANAGER_EMAIL = process.env.E2E_PROGRAM_MANAGER_EMAIL
const MANAGER_PASSWORD = process.env.E2E_PROGRAM_MANAGER_PASSWORD
const REORDER_EVENT_ID = process.env.E2E_REORDER_EVENT_ID
// A meeting's section, named by its title and its kind's tag (« Services »).
const SERVICES_SECTION = /Services$/

// Depending on how React Router routes a fetcher's POST, it reaches the `.data` URL or the route itself: accept both.
const REORDER_SERVICES_RE = /\/reorder-services(\.data)?$/
const EVENT_REORDER_URL_RE = /\/programs\/events\/\d+\/reorder-services(\.data)?$/
const DRAGGABLE_RE = /draggable item (\d+)/i

/** The services panel's rows only: the programme's parts are sortable too, in their own panel. */
function serviceRows(page: Page) {
  return page.getByRole('region', { name: 'Services' }).locator('[data-sortable]')
}

/**
 * Moves the first service one place down with the keyboard and returns the reorder response. dnd-kit announces each
 * step in a live region (its default English wording): drop only once it says the service is over another one.
 */
async function moveFirstServiceDown(page: Page) {
  const responsePromise = page.waitForResponse(
    response => REORDER_SERVICES_RE.test(response.url()) && response.request().method() === 'POST',
  )
  const announcement = page.getByRole('status').filter({ hasText: DRAGGABLE_RE })
  await page
    .getByRole('region', { name: 'Services' })
    .locator('button[aria-roledescription="sortable"]')
    .first()
    .focus()
  await page.keyboard.press('Space')
  await expect(announcement).toHaveText(DRAGGABLE_RE)
  const activeId = (await announcement.textContent())?.match(DRAGGABLE_RE)?.[1]
  // The pick-up is announced before dnd-kit attaches its keydown listener (in a setTimeout): an arrow pressed in between
  // is lost. Press again only while no move over another service has been announced, which keeps a slow first press
  // from moving it two places, short of an announcement slower than half a second.
  const overAnother = new RegExp(`over droppable area (?!${activeId}\\b)\\d+`)
  await expect(async () => {
    if (!overAnother.test((await announcement.textContent()) ?? '')) await page.keyboard.press('ArrowDown')
    await expect(announcement).toHaveText(overAnother, { timeout: 500 })
  }).toPass()
  await page.keyboard.press('Space')
  return responsePromise
}

test.describe('Services drag-drop reorder', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !MANAGER_EMAIL || !MANAGER_PASSWORD,
      'needs E2E_PROGRAM_MANAGER_EMAIL/PASSWORD (role account not seeded in CI yet)',
    )
    const loggedIn = await login(page, MANAGER_EMAIL ?? '', MANAGER_PASSWORD ?? '')
    if (!loggedIn) test.skip()
  })

  test('an event’s services keep the order they are dragged into', async ({ page }) => {
    test.skip(!REORDER_EVENT_ID, 'needs E2E_REORDER_EVENT_ID (event not seeded in CI yet)')
    // The schedule's own page (« Modifier le planning », D38), from its section of the meeting.
    await page.goto(`/programs/events/${REORDER_EVENT_ID}`)
    await page
      .getByRole('region', { name: SERVICES_SECTION })
      .getByRole('link', { name: 'Modifier le planning' })
      .click()
    await page.waitForLoadState('networkidle')

    const rowsBefore = await serviceRows(page).allTextContents()
    // E2E_REORDER_EVENT_ID names an event with services: fewer than two means the selectors broke.
    expect(rowsBefore.length, 'the event’s services').toBeGreaterThanOrEqual(2)

    const response = await moveFirstServiceDown(page)
    expect(response.ok()).toBeTruthy()
    expect(response.url()).toMatch(EVENT_REORDER_URL_RE)

    await page.reload()
    const rowsAfter = await serviceRows(page).allTextContents()
    expect(rowsAfter.slice(0, 2)).toEqual([rowsBefore[1], rowsBefore[0]])
    expect(rowsAfter.slice(2)).toEqual(rowsBefore.slice(2))
  })
})
