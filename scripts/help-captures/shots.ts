import type { Locator, Page } from '@playwright/test'
import type { HelpLocale } from '~/features/help/model/help.type'
import * as m from '~/i18n/paraglide/messages'

/**
 * One capture of the help: who is signed in, the page, what to do there, and the elements the step names, framed
 * together with a margin. The id is what an article writes: `![what it shows](capture:<id>)`. Captures are taken in
 * both languages and both themes, so a shot finds its elements by role and by the app's own messages in the reader's
 * language, never by French words written here.
 */
export interface HelpShot {
  id: string
  /** A demo account (app/database/seed-marketing.ts). */
  account: string
  path: string
  /** Brings the page to the state the capture shows. */
  prepare?: (page: Page, locale: HelpLocale) => Promise<void>
  /** The elements the capture frames: the crop is the box around all of them. */
  frame: (page: Page, locale: HelpLocale) => Locator[]
  /** Room around the elements, in CSS pixels. `-1` trims the element's own border line. */
  margin?: number
  /**
   * The window, when the default 1280 × 800 does not suit: narrower for a list row or a title with its control, so the
   * crop reads in the 400 px help panel; taller for a form that runs past the fold.
   */
  viewport?: { width?: number; height?: number }
}

// An admin, for the pages that manage; and a publisher who holds territories, for Mes territoires.
const MARC = 'marc.dupont@demo.unitae.app'
const MAXIME = 'maxime.mensah@demo.unitae.app'

/** The nearest enclosing element that matches, e.g. the row around a button. */
function closest(locator: Locator, xpathTest: string): Locator {
  return locator.locator(`xpath=ancestor::*[${xpathTest}][1]`)
}

/** A form section of the page, found by its title. */
function section(page: Page, title: string): Locator {
  return page.getByRole('region', { name: title, exact: true })
}

export const HELP_SHOTS: HelpShot[] = [
  {
    // absences: « Cliquez sur Nouvelle absence, en haut à droite de la page. »
    id: 'absences-new',
    account: MARC,
    path: '/me/days-off',
    frame: (page, locale) => [
      page.getByRole('link', { name: m.days_off_new_button({}, { locale }) }).first(),
      page.getByRole('link', { name: m.help_entry_label({}, { locale }) }).first(),
    ],
    // Inside the 48 px top bar: a wider margin catches its bottom hairline.
    margin: 5,
  },
  {
    // my-territories: a row gives the number and the due date; its PDF button downloads the territory's card.
    id: 'my-territories-row',
    account: MAXIME,
    path: '/me/territories',
    // Narrower than the default, so the row reads in the panel; wide enough that its streets are not cut.
    viewport: { width: 1100 },
    // A row with a due date ahead, as the article describes it: the list puts late territories first.
    frame: (page, locale) => [
      page
        .locator('li')
        .filter({ has: page.getByText(m.my_territories_pdf_short({}, { locale }), { exact: true }) })
        .filter({ hasText: m.my_territories_due_on({ date: '' }, { locale }).trim() })
        .first(),
    ],
    margin: -1,
  },
  {
    // board-read: « choisissez Non lus au-dessus de la liste ».
    id: 'board-read-filter',
    account: MARC,
    path: '/board',
    viewport: { width: 720 },
    frame: (page, locale) => [
      page.getByRole('heading', { level: 1 }),
      closest(page.getByText(m.board_filter_all({}, { locale }), { exact: true }).first(), 'self::fieldset'),
    ],
  },
  {
    // board-download: « Cliquez sur Télécharger pour un document PDF ».
    id: 'board-download-button',
    account: MARC,
    path: '/board',
    prepare: async page => {
      await page.locator('a[href*="/board/documents/"][href$="/viewer"]').first().click()
      await page.waitForURL(url => url.pathname.endsWith('/viewer'), { waitUntil: 'commit' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    },
    frame: (page, locale) => [page.getByRole('link', { name: m.board_viewer_download({}, { locale }) }).first()],
    margin: 5,
  },
  {
    // board-versions: « cliquez sur Historique à côté du fichier actuel ». The first PDF has two versions
    // (stage-demo.sql).
    id: 'board-versions-history',
    account: MARC,
    path: '/board/documents/1/edit',
    // The section's title and the current file's card, without the drop zone under it.
    frame: (page, locale) => {
      const history = page.getByRole('link', { name: m.board_form_file_history({}, { locale }), exact: true })
      return [
        closest(history, 'self::section').locator('h2'),
        closest(history, 'contains(@class, "rounded-lg") and contains(@class, "border")'),
      ]
    },
    // Short of the drop zone's dashed edge under the card.
    margin: 6,
  },
  {
    // board-versions: the history panel, each version with its download and « Remettre ».
    id: 'board-versions-panel',
    account: MARC,
    path: '/board/documents/1/edit?historique',
    frame: (page, locale) => [
      closest(
        page.getByRole('button', { name: m.board_versions_restore({}, { locale }), exact: true }).first(),
        'self::aside or @role="complementary" or @role="dialog"',
      ),
    ],
    margin: 0,
  },
  {
    // create-territory: « Renseignez le Numéro », « Choisissez le Type ».
    id: 'territory-new-header',
    account: MARC,
    path: '/territories/territory/new',
    frame: (page, locale) => [
      page.getByText(m.territory_editor_number_field({}, { locale }), { exact: true }).first(),
      page.getByText(m.territory_editor_type_field({}, { locale }), { exact: true }).first(),
      page.getByRole('combobox').first(),
    ],
    margin: 8,
  },
  {
    // campaign-create: the « Au début » and « À la fin » steps.
    id: 'campaign-start-end',
    account: MARC,
    path: '/territories/attributions/campaigns/new',
    viewport: { height: 1400 },
    // From the first section's title to the second one's last option: no border line between sections at the edges.
    frame: (page, locale) => [
      section(page, m.campaigns_form_start_legend({}, { locale })).locator('h2'),
      section(page, m.campaigns_form_end_legend({}, { locale })).locator(':scope > div').last(),
    ],
    margin: 12,
  },
  {
    // prospection: « cliquez sur Nouveau bâtiment », « cliquez sur Synchroniser… ».
    id: 'prospection-actions',
    account: MARC,
    path: '/territories/buildings',
    frame: (page, locale) => [
      page.getByRole('button', { name: m.prospection_sync_open({}, { locale }) }).first(),
      page.getByRole('link', { name: m.prospection_new_building_button({}, { locale }) }).first(),
    ],
    margin: 5,
  },
  {
    // bano: the BANO file and the postal codes, in Réglages › Territoires.
    id: 'settings-bano',
    account: MARC,
    path: '/settings/territories',
    frame: (page, locale) => [
      page.getByText(m.settings_territories_bano_url_label({}, { locale }), { exact: true }).first(),
      page.getByLabel(m.settings_territories_bano_url_label({}, { locale }), { exact: true }).first(),
      page.getByText(m.settings_territories_zips_hint({}, { locale }), { exact: true }).first(),
    ],
  },
  {
    // phone-territories: « sur la ligne Téléphone, activez l’interrupteur ».
    id: 'settings-phone-switch',
    account: MARC,
    path: '/settings/territories',
    frame: (page, locale) => [
      closest(
        page.getByRole('switch', { name: m.settings_territories_phone_active_label({}, { locale }) }),
        'contains(@class, "border-t")',
      ),
    ],
    margin: -1,
  },
  {
    // password: « Sur la ligne Mot de passe, cliquez sur Changer le mot de passe… ».
    id: 'account-password-row',
    account: MAXIME,
    path: '/me/security',
    frame: (page, locale) => [
      closest(
        page.getByRole('button', { name: m.account_password_change({}, { locale }) }),
        'contains(@class, "border-t")',
      ),
    ],
    margin: -1,
    viewport: { width: 1000 },
  },
  {
    // two-step-verification: « Sur la ligne Vérification en deux étapes, cliquez sur Activer… ». The row only: the
    // dialog shows a QR code and a key, which a capture never publishes.
    id: 'account-two-step-row',
    account: MAXIME,
    path: '/me/security',
    frame: (page, locale) => [
      closest(page.getByRole('button', { name: m.account_2fa_enable({}, { locale }) }), 'contains(@class, "border-t")'),
    ],
    margin: -1,
    viewport: { width: 1000 },
  },
  {
    // calendar-feed: « Cliquez sur Créer mon lien ». Before the link exists: a capture never shows a feed address.
    id: 'account-calendar-create',
    account: MAXIME,
    path: '/me/profile',
    frame: (page, locale) => [section(page, m.account_calendar_title({}, { locale }))],
    viewport: { width: 1000 },
  },
  {
    // notifications: the emails of a subject, one switch each.
    id: 'account-notifications',
    account: MAXIME,
    path: '/me/notifications',
    frame: page => [page.locator('section[aria-labelledby^="notifications-"]').first()],
    viewport: { width: 1000 },
  },
  {
    // language: the Langue and Thème rows of Préférences.
    id: 'account-preferences',
    account: MAXIME,
    path: '/me/preferences',
    frame: (page, locale) => [page.locator(`[aria-label="${m.account_section_preferences({}, { locale })}"]`)],
    margin: -1,
    viewport: { width: 1000 },
  },
  {
    // my-data: « Dans Vos données, sur la ligne Télécharger mes données, cliquez sur Télécharger ».
    id: 'account-data',
    account: MAXIME,
    path: '/me/privacy',
    frame: (page, locale) => [section(page, m.account_data_title({}, { locale }))],
    viewport: { width: 1000 },
  },
]
