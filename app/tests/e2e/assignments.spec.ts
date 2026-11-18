import { expect, type Locator, type Page, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

// The whole path of an assignment, as whoever prepares the programmes walks it: a part and a service given to a
// publisher, the programme published, the board's programme showing them, then unpublished and gone from the board.
// Each run creates its own publisher and picks its own meeting far ahead, so reruns never meet each other.

const TIME_ZONE = 'Europe/Paris'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TUESDAY = 2
const SINGLE_RE = /^Une seule date$/
const SUBMIT_SINGLE_RE = /^Créer le programme$/
const MIDWEEK_RE = /^Réunion de semaine/
const EDIT_URL_RE = /\/programs\/events\/(\d+)\/edit/
const PUBLISHER_FORM_SUBMIT_RE = /enregistrer|sauvegarder|créer|ajouter/i
const PROGRAMME_DOCUMENT_RE = /^(Nouveau )?Programme\b/
const FIRSTNAME_RE = /prénom/i
const LASTNAME_RE = /^nom$/i
const NEW_PUBLISHER_URL_RE = /\/publishers\/new/

function localWeekday(date: Date): number {
  return WEEKDAYS.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short' }).format(date))
}

/** A Tuesday between one and three years ahead, as typed in a date field: a meeting of this run's own. */
function farTuesday(): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + 400 + (Math.floor(Date.now() / 1000) % 700))
  while (localWeekday(date) !== TUESDAY) date.setUTCDate(date.getUTCDate() + 1)
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

async function retype(field: Locator, value: string) {
  await field.click()
  await field.press('ControlOrMeta+a')
  await field.pressSequentially(value)
  await field.press('Tab')
}

async function createPublisher(page: Page, firstname: string, lastname: string) {
  await page.goto('/publishers/new')
  await page.getByLabel(FIRSTNAME_RE).fill(firstname)
  await page.getByLabel(LASTNAME_RE).fill(lastname)
  await page.getByRole('button', { name: 'Frère', exact: true }).click()
  await page.getByRole('button', { name: PUBLISHER_FORM_SUBMIT_RE }).click()
  await expect(page).not.toHaveURL(NEW_PUBLISHER_URL_RE)
}

/** Creates the midweek programme on `typed`, or opens the one the day already has; returns its id. */
async function openMeeting(page: Page, typed: string): Promise<string> {
  await page.goto('/programs/new')
  await page.getByRole('button', { name: SINGLE_RE }).click()
  await page.getByText(MIDWEEK_RE).first().click()
  await retype(page.locator('#creation-day'), typed)
  await page.getByRole('button', { name: SUBMIT_SINGLE_RE }).click()
  const existing = page.getByRole('link', { name: 'Voir ce programme' })
  await Promise.race([page.waitForURL(EDIT_URL_RE), existing.waitFor()])
  if (!EDIT_URL_RE.test(page.url())) {
    await page.goto(`${await existing.getAttribute('href')}/edit`)
    await page.waitForURL(EDIT_URL_RE)
  }
  return EDIT_URL_RE.exec(page.url())?.[1] ?? ''
}

/** Gives a row of the programme to someone through its side panel, and waits for the row to show them. */
async function assign(page: Page, row: string, picker: 'Orateur' | 'Proclamateur', person: string) {
  await page.getByRole('button', { name: `Attribuer ${row}`, exact: true }).click()
  const panel = page.getByRole('complementary')
  await panel.getByRole('button', { name: picker }).click()
  await page.getByRole('combobox', { name: 'Rechercher par nom…' }).fill(person)
  await page.getByRole('option', { name: new RegExp(`^${person}`) }).click()
  await panel.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: row }).first().getByRole('link', { name: person })).toBeVisible()
  // Saving closes the panel.
  await expect(panel).toBeHidden()
}

/** The board's programme document, created with its section on a board that has none yet. */
async function programmeDocument(page: Page): Promise<string> {
  await page.goto('/board')
  const existing = page.getByRole('link', { name: PROGRAMME_DOCUMENT_RE }).first()
  if ((await existing.count()) > 0) return (await existing.getAttribute('href')) ?? ''

  await page.goto('/board/documents/new-dynamic?type=programme')
  if (await page.getByRole('link', { name: 'Créer une section' }).isVisible()) {
    await page.goto('/board/sections/new')
    await page.getByRole('textbox', { name: 'Nom' }).fill('Réunions')
    await page.getByRole('button', { name: 'Créer la section' }).click()
    await page.goto('/board/documents/new-dynamic?type=programme')
  }
  await page.getByRole('button', { name: 'Ajouter au tableau' }).click()
  await page.goto('/board')
  return (await page.getByRole('link', { name: PROGRAMME_DOCUMENT_RE }).first().getAttribute('href')) ?? ''
}

test.describe('Assignments', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('assigns a part and a service, publishes, finds them on the board, then unpublishes', async ({ page }) => {
    const lastname = `ATTRIBUTION${Date.now() % 1_000_000}`
    const person = `Lucien ${lastname}`
    await createPublisher(page, 'Lucien', lastname)

    const eventId = await openMeeting(page, farTuesday())
    await page.goto(`/programs/events/${eventId}`)
    await assign(page, 'Lecture de la Bible', 'Orateur', person)
    await assign(page, 'Estrade', 'Proclamateur', person)

    await page.getByRole('button', { name: 'Publier', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Repasser en brouillon' })).toBeVisible()
    await expect(page.getByText('Publié', { exact: true })).toBeVisible()

    // The board opened on this meeting, as a notice's link opens it.
    const viewer = `${await programmeDocument(page)}?eventId=${eventId}`
    await page.goto(viewer)
    const main = page.getByRole('main')
    await expect(main.getByText('Lecture de la Bible')).toBeVisible()
    await expect(main.getByText(lastname).first()).toBeVisible()
    await expect(main.getByText(lastname)).toHaveCount(2)

    await page.goto(`/programs/events/${eventId}`)
    await page.getByRole('button', { name: 'Repasser en brouillon' }).click()
    await expect(page.getByRole('button', { name: 'Publier', exact: true })).toBeVisible()

    await page.goto(viewer)
    await expect(page.getByRole('main').getByText(lastname)).toHaveCount(0)
  })
})
