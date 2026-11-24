import { expect, type Locator, type Page, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

// The admin holds the three attendance rights, so one account walks both flows: entering the counts while a meeting
// runs, and correcting a meeting afterwards from the attendance page. The meetings it prepares stay behind, as the
// other specs' records do; a second run finds them and carries on.

const TIME_ZONE = 'Europe/Paris'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SATURDAY = 6
const SINGLE_RE = /^Une seule date$/
const SUBMIT_SINGLE_RE = /^Créer la réunion$/
const EDIT_URL_RE = /\/programs\/events\/\d+\/edit/
// Created, a programme opens on the meeting's page.
const EVENT_URL_RE = /\/programs\/events\/\d+(?:[?#]|$)/
const MIDWEEK_RE = /^Réunion de semaine/
const WEEKEND_RE = /^Réunion du week-end/
const CARD_RE = /^Assistance · Réunion de semaine/
const SAVED_BY_YOU_RE = /^Par vous à \d\d:\d\d$/

interface Day {
  /** As typed in a date field. */
  typed: string
  /** As the attendance list writes it. */
  written: string
  serviceYear: number
}

/** The day `offset` days from today in the congregation's zone, moved on (or back) to `weekday` when one is given. */
function dayFrom(offset: number, weekday?: number): Day {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  const step = offset < 0 ? -1 : 1
  while (weekday != null && localWeekday(date) !== weekday) date.setUTCDate(date.getUTCDate() + step)
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, ...options }).format(date)
  const typed = format({ day: '2-digit', month: '2-digit', year: 'numeric' })
  const [, month, year] = typed.split('/').map(Number)
  return {
    typed,
    written: format({ weekday: 'short', day: 'numeric', month: 'short' }),
    serviceYear: month >= 9 ? year : year - 1,
  }
}

function localWeekday(date: Date): number {
  return WEEKDAYS.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short' }).format(date))
}

/** Types into a date field the way a person does, replacing what it holds; the field commits when left. */
async function retype(field: Locator, value: string) {
  await field.click()
  await field.press('ControlOrMeta+a')
  await field.pressSequentially(value)
  await field.press('Tab')
}

/** Opens the page of a template's programme on a day: created now, or the one the day already has. */
async function openMeeting(page: Page, template: RegExp, day: Day) {
  await page.goto('/programs/new')
  await page.getByRole('button', { name: SINGLE_RE }).click()
  await page.getByText(template).first().click()
  await retype(page.locator('#creation-day'), day.typed)
  await page.getByRole('button', { name: SUBMIT_SINGLE_RE }).click()
  // Created, the meeting's page opens; already there, the page offers it. Its details are on « Modifier la réunion ».
  const existing = page.getByRole('link', { name: 'Voir ce programme' })
  await Promise.race([page.waitForURL(EVENT_URL_RE), existing.waitFor()])
  const meeting = EVENT_URL_RE.test(page.url()) ? new URL(page.url()).pathname : await existing.getAttribute('href')
  await page.goto(`${meeting}/edit`)
  await page.waitForURL(EDIT_URL_RE)
}

/** Saves the meeting's details from the save bar, which shows once a field changed and goes once they are saved. */
async function saveDetails(page: Page) {
  const save = page.getByRole('button', { name: 'Enregistrer' })
  await save.click()
  await expect(save).toHaveCount(0)
}

test.describe('Meeting attendance', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('enters the hall count, then the online count, from the dashboard card while the meeting runs', async ({
    page,
  }) => {
    await openMeeting(page, MIDWEEK_RE, dayFrom(0))
    // Started at midnight: under way whatever the hour the suite runs at.
    // A second run finds the meeting already moved there.
    if ((await page.locator('#startTime').inputValue()) !== '00:00') {
      await page.locator('#startTime').fill('00:00')
      await page.locator('#endTime').fill('00:05')
      await saveDetails(page)
    }

    await page.goto('/')
    const card = page.getByRole('region', { name: CARD_RE })
    await expect(card).toBeVisible()
    // Counts of its own on each run: retyping the saved ones would change nothing to save.
    const hall = 80 + (Date.now() % 20)
    const online = 10 + (Math.floor(Date.now() / 20) % 9)
    const edit = card.getByRole('button', { name: 'Modifier' })
    if (await edit.isVisible()) {
      // A second run finds both counts entered: it changes them together.
      await edit.click()
      await card.getByLabel('En salle').fill(String(hall))
      await card.getByLabel('En visio').fill(String(online))
      await card.getByRole('button', { name: 'Enregistrer' }).click()
    } else {
      await card.getByLabel('En salle').fill(String(hall))
      await card.getByRole('button', { name: 'Enregistrer' }).click()
      await expect(card.getByText(SAVED_BY_YOU_RE)).toBeVisible()
      await expect(card.getByText('1 nombre sur 2')).toBeVisible()

      await card.getByLabel('En visio').fill(String(online))
      await card.getByRole('button', { name: 'Enregistrer' }).click()
    }
    await expect(card.getByText(`${hall} en salle · ${online} en visio`)).toBeVisible()
    await expect(card.getByText(String(hall + online), { exact: true })).toBeVisible()
  })

  test('corrects a past meeting from the attendance page’s side panel', async ({ page }) => {
    // A programme is never created in the past: next Saturday's meeting is moved back to last Saturday.
    const past = dayFrom(-2, SATURDAY)
    await openMeeting(page, WEEKEND_RE, dayFrom(1, SATURDAY))
    await retype(page.locator('#date'), past.typed)
    await saveDetails(page)

    await page.goto(`/attendance?year=${past.serviceYear}`)
    await page
      .getByRole('button', { name: `Voir l’assistance du ${past.written}` })
      .first()
      .click()
    const panel = page.locator('aside').filter({ hasText: 'Assistance totale' })
    const hall = 100 + (Date.now() % 20)
    const online = 10 + (Math.floor(Date.now() / 20) % 9)
    await panel.getByLabel('En salle').fill(String(hall))
    await panel.getByLabel('En visioconférence').fill(String(online))
    await panel.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(panel.getByText(String(hall + online), { exact: true })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: past.written }).first()).toContainText(String(hall + online))
  })
})
