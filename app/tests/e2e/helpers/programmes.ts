import { expect, type Locator, type Page } from '@playwright/test'

// What the programme specs share: a publisher of the run's own, a midweek meeting far ahead, a row given to someone
// through its side panel, and the board's programme document found by its title.

const TIME_ZONE = 'Europe/Paris'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TUESDAY = 2
const SINGLE_RE = /^Une seule date$/
const SUBMIT_SINGLE_RE = /^Créer le programme$/
const MIDWEEK_RE = /^Réunion de semaine/
const EDIT_URL_RE = /\/programs\/events\/(\d+)\/edit/
const PUBLISHER_FORM_SUBMIT_RE = /enregistrer|sauvegarder|créer|ajouter/i
const FIRSTNAME_RE = /prénom/i
const BOARD_DOCUMENTS_URL_RE = /\/board\/documents$/
const LASTNAME_RE = /^nom$/i
const NEW_PUBLISHER_URL_RE = /\/publishers\/new/

function localWeekday(date: Date): number {
  return WEEKDAYS.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short' }).format(date))
}

/**
 * A Tuesday far ahead, as typed in a date field: a meeting of this run's own. Each spec its own range (`from` days
 * ahead, then up to 700 more), so two specs started in the same second never share a meeting.
 */
export function farTuesday(from = 400): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + from + (Math.floor(Date.now() / 1000) % 700))
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

export async function createPublisher(page: Page, firstname: string, lastname: string) {
  await page.goto('/publishers/new')
  await page.getByLabel(FIRSTNAME_RE).fill(firstname)
  await page.getByLabel(LASTNAME_RE).fill(lastname)
  await page.getByRole('button', { name: 'Frère', exact: true }).click()
  await page.getByRole('button', { name: PUBLISHER_FORM_SUBMIT_RE }).click()
  await expect(page).not.toHaveURL(NEW_PUBLISHER_URL_RE)
}

/** Creates the midweek programme on `typed`, or opens the one the day already has; returns its id. */
export async function openMeeting(page: Page, typed: string): Promise<string> {
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
  const id = EDIT_URL_RE.exec(page.url())?.[1]
  if (!id) throw new Error(`no programme id in ${page.url()}`)
  return id
}

/** Gives a row of the programme to someone through its side panel, and waits for the row to show them. */
export async function assign(page: Page, row: string, picker: 'Orateur' | 'Proclamateur', person: string) {
  await page.getByRole('button', { name: `Attribuer ${row}`, exact: true }).click()
  const panel = page.getByRole('complementary')
  await panel.getByRole('button', { name: picker }).click()
  await page.getByRole('combobox', { name: 'Rechercher par nom…' }).fill(person)
  await page.getByRole('option', { name: new RegExp(`^${person}`) }).click()
  await panel.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: row }).first().getByRole('link', { name: person })).toBeVisible()
  // The panel closes only once the save succeeded.
  await expect(panel).toBeHidden()
}

/**
 * A spec's programme document — all meetings, parts and services — found by its title or created, with a section if
 * the board has none. Each spec its own title: specs running side by side never race to create one.
 */
export async function programmeDocument(page: Page, title: string): Promise<string> {
  await page.goto('/board')
  const card = page.getByRole('link', { name: new RegExp(title.replace(/[()]/g, '\\$&')) })
  if ((await card.count()) === 0) {
    await page.goto('/board/documents/new-dynamic?type=programme')
    const noSection = page.getByRole('link', { name: 'Créer une section' })
    const form = page.getByRole('textbox', { name: 'Titre' })
    await expect(noSection.or(form)).toBeVisible()
    if (await noSection.isVisible()) {
      await page.goto('/board/sections/new')
      await page.getByRole('textbox', { name: 'Nom' }).fill('Réunions')
      await page.getByRole('button', { name: 'Créer la section' }).click()
      await expect(page).toHaveURL(BOARD_DOCUMENTS_URL_RE)
      await page.goto('/board/documents/new-dynamic?type=programme')
    }
    await form.fill(title)
    await page.getByRole('button', { name: 'Ajouter au tableau' }).click()
    await expect(page).toHaveURL(BOARD_DOCUMENTS_URL_RE)
    await page.goto('/board')
  }
  const href = await card.first().getAttribute('href')
  if (!href) throw new Error('the programme document has no link on the board')
  return href
}

/** Withdraws every schedule of the meeting open on the page: a run that stopped half way leaves none published. */
export async function withdrawAll(page: Page) {
  const withdraw = page.getByRole('button', { name: 'Repasser en brouillon' })
  for (let left = await withdraw.count(); left > 0; left--) {
    await withdraw.first().click()
    await expect(withdraw).toHaveCount(left - 1)
  }
}
