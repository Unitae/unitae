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
// Maxime's publisher record: someone else's for MARC, whose own status he could not change.
const MAXIME_RECORD = 100

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
  {
    // my-parts: « Mes prochaines affectations » on the home page, a publisher's parts and services.
    id: 'programs-my-assignments',
    account: MAXIME,
    path: '/',
    frame: (page, locale) => [section(page, m.dashboard_upcoming_assignments({}, { locale }))],
    viewport: { width: 1000 },
  },
  {
    // external-speakers: « Cliquez sur le nom de l’assemblée, puis sur Mettre à jour la liste. »
    id: 'external-speakers-update',
    account: MARC,
    path: '/programs/external-speakers',
    prepare: async (page, locale) => {
      await page.locator('table button.font-semibold').first().click()
      await page
        .locator('aside')
        .getByRole('link', { name: m.external_speakers_update_list({}, { locale }) })
        .waitFor()
      // The panel slides in: framed before it settles, the crop would cut its right side.
      await page
        .locator('aside')
        .evaluate(panel => Promise.all(panel.getAnimations({ subtree: true }).map(animation => animation.finished)))
    },
    // The congregation's panel: its contacts, its latest list and the button.
    frame: page => [page.locator('aside')],
    margin: -1,
    // At 1280 px the docked panel runs past the window's edge, and the crop would cut it.
    viewport: { width: 1600 },
  },
  {
    // attendance-entry: the card of a meeting under way, on the home page (stage-demo.sql starts one): the hall count
    // entered by someone else, the online count still to enter.
    id: 'attendance-entry-card',
    account: MARC,
    path: '/',
    frame: (page, locale) => [
      page.locator(`section[aria-label^="${m.attendance_card_title({ name: '' }, { locale })}"]`).first(),
    ],
    margin: -1,
    viewport: { width: 1000 },
  },
  {
    // attendance-s88: « cliquez sur Exporter » opens the export dialog, the S-88 card among its formats.
    id: 'attendance-export',
    account: MARC,
    path: '/attendance',
    prepare: async (page, locale) => {
      await page.getByRole('button', { name: m.attendance_export({}, { locale }) }).click()
      await page.getByRole('dialog').waitFor()
    },
    frame: page => [page.getByRole('dialog')],
    margin: -1,
  },
  {
    // field-service-reports: on a group's page, « Saisir » on the row of a publisher with no report opens it beside
    // the list.
    id: 'field-service-report-panel',
    account: MARC,
    path: '/groups',
    prepare: async (page, locale) => {
      await page.locator('a[href$="/view"]').first().click()
      await page.waitForURL(url => url.pathname.endsWith('/view'))
      await page
        .getByRole('button', { name: m.activity_row_enter({}, { locale }), exact: true })
        .first()
        .click()
      await settledPanel(page)
    },
    frame: page => [sidePanel(page)],
    margin: -1,
    // The docked panel needs the room: at 1280 px it runs past the window's edge.
    viewport: { width: 1600, height: 900 },
  },
  {
    // pioneers: « Les pionniers en chiffres » at the top of the Pionniers view.
    id: 'pioneers-summary',
    account: MARC,
    path: '/publishers/activity/pioneers',
    frame: (page, locale) => [page.getByLabel(m.pioneers_summary_label({}, { locale }), { exact: true })],
    viewport: { width: 900 },
  },
  {
    // publisher-arrivals-departures: the record's « … » menu › « A quitté l’assemblée… » says what becomes of the record.
    // The date field below is left out: a bare date input takes the capture browser's format, not the reader's.
    id: 'publisher-departure',
    account: MARC,
    path: `/publishers/${MAXIME_RECORD}/view`,
    prepare: async (page, locale) => {
      await page.getByRole('button', { name: m.publishers_record_more_actions({ name: '' }, { locale }) }).click()
      await page.getByRole('menuitem', { name: m.publishers_record_menu_left({}, { locale }) }).click()
      await page.getByRole('dialog').waitFor()
    },
    frame: page => [page.getByRole('dialog').getByRole('heading'), page.getByRole('dialog').getByRole('list')],
    margin: 12,
  },
  {
    // groups: a group's form, its name and address, then its overseer and assistant.
    id: 'group-form',
    account: MARC,
    path: '/groups',
    prepare: async page => {
      await page.locator('a[href$="/view"]').first().click()
      await page.waitForURL(url => url.pathname.endsWith('/view'))
      await page.locator('a[href$="/edit"]').first().click()
      await page.waitForURL(url => url.pathname.endsWith('/edit'))
    },
    frame: (page, locale) => [
      section(page, m.groups_form_section_group({}, { locale })),
      section(page, m.groups_form_section_leaders({}, { locale })),
    ],
    // Narrow enough that each section's fields go under its title, so the crop reads in the help panel.
    viewport: { width: 820, height: 1000 },
  },
  {
    // emergency-roster: the record's « Urgence » block, « Modifier » opens the emergency information beside it.
    id: 'emergency-info',
    account: MARC,
    path: `/publishers/${MAXIME_RECORD}/view`,
    prepare: async (page, locale) => {
      await page.getByRole('button', { name: m.publishers_emergency_edit_link({}, { locale }), exact: true }).click()
      await settledPanel(page)
    },
    frame: page => [sidePanel(page)],
    margin: -1,
    viewport: { width: 1600, height: 900 },
  },
  {
    // activity-exports: « Exporter » on the Activité page, its format, service year and scope.
    id: 'activity-export',
    account: MARC,
    path: '/publishers/activity',
    prepare: async (page, locale) => {
      await page.getByRole('button', { name: m.activity_export_button({}, { locale }), exact: true }).click()
      await page.getByRole('dialog').waitFor()
    },
    frame: page => [page.getByRole('dialog')],
    margin: -1,
  },
  {
    // territory-attributions: « Attribuer » on a row of « Attribuer un territoire » opens the panel.
    id: 'territory-assign-panel',
    account: MARC,
    path: '/territories/attributions/new/available-territories',
    prepare: async (page, locale) => {
      await page
        .getByRole('button', { name: m.attributions_assign_row_button({}, { locale }), exact: true })
        .first()
        .click()
      await settledPanel(page)
      await sidePanel(page).getByText(m.attributions_panel_publisher({}, { locale }), { exact: true }).waitFor()
    },
    frame: page => [sidePanel(page)],
    margin: -1,
    viewport: { width: 1600, height: 900 },
  },
  {
    // territory-card: a territory's « … » menu, open on « Télécharger le PDF ».
    id: 'territory-card-menu',
    account: MARC,
    path: '/territories',
    prepare: async (page, locale) => {
      await menuButton(page, locale).click()
      await page.getByRole('menu').waitFor()
    },
    // The button and its menu: the territories table is wider than the window, so its row would take in the sidebar.
    frame: page => [page.locator('button[aria-haspopup="menu"][data-state="open"]'), page.getByRole('menu')],
    margin: 12,
    viewport: { width: 1100 },
  },
  {
    // split-territory: a new territory takes entrances from others; the changes say what becomes of them. The capture
    // app has no base map, so the entrances are found by their address, as the article's last step says.
    id: 'territory-split-take',
    account: MARC,
    path: '/territories/territory/new',
    prepare: async (page, locale) => {
      const search = page.getByLabel(m.territory_editor_search_label({}, { locale }), { exact: true })
      await search.fill('Pyrénées')
      const take = page.getByRole('button', { name: m.territory_editor_search_take({}, { locale }), exact: true })
      await take.first().click()
      await page.getByRole('region', { name: m.territory_editor_changes({}, { locale }), exact: true }).waitFor()
      // The results would push the lists below the fold.
      await search.fill('')
      await take.first().waitFor({ state: 'detached' })
    },
    frame: (page, locale) => [
      page.getByRole('region', { name: m.territory_editor_entrances({}, { locale }), exact: true }),
      page.getByRole('region', { name: m.territory_editor_changes({}, { locale }), exact: true }),
    ],
    margin: -1,
    viewport: { height: 1100 },
  },
  {
    // batch-territories: the top of « Créer en lot »: the next number, the type, the filters, the free entrances.
    id: 'territory-batch-header',
    account: MARC,
    path: '/territories/buildings/split-territories',
    frame: (page, locale) => [
      closest(
        page.getByRole('heading', { name: m.split_tool_heading({}, { locale }), exact: true, level: 1 }),
        'self::section',
      ),
    ],
    margin: -1,
  },
  {
    // territory-stats: « État global », the figures of today.
    id: 'territory-stats-global',
    account: MARC,
    path: '/territories/stats',
    frame: (page, locale) => [
      closest(page.getByRole('heading', { name: m.stats_global_heading({}, { locale }), exact: true }), 'self::div'),
      page.getByLabel(m.stats_global_heading({}, { locale }), { exact: true }),
    ],
    viewport: { width: 1100 },
  },
  {
    // board-add-pdf: « Affichage » on the upload form: when it shows, when it goes, « À la une ».
    id: 'board-pdf-display',
    account: MARC,
    path: '/board/documents/new',
    frame: (page, locale) => [section(page, m.board_form_display_title({}, { locale }))],
    margin: 8,
    viewport: { width: 1000, height: 1000 },
  },
  {
    // board-dynamic: the kinds of live document, on « Document dynamique ».
    id: 'board-dynamic-types',
    account: MARC,
    path: '/board/documents/new-dynamic',
    frame: (page, locale) => [
      page.locator('ul').filter({ has: page.getByText(m.board_dynamic_type_programme_description({}, { locale })) }),
    ],
    margin: -1,
    viewport: { width: 1000 },
  },
  {
    // board-sections: a section's « … » menu on « Gérer le tableau ».
    id: 'board-section-menu',
    account: MARC,
    path: '/board/documents',
    prepare: async (page, locale) => {
      const prefix = m.board_manage_section_more({ name: '' }, { locale })
      // The second section: the first one cannot move up.
      const row = page
        .locator('tr')
        .filter({ has: page.getByRole('button', { name: new RegExp(`^${prefix}`) }) })
        .nth(1)
      // Scrolled under the top bar first: the open menu would not follow the page when the framing scrolls it.
      const box = await row.boundingBox()
      if (box != null) await page.evaluate(by => window.scrollBy(0, by), box.y - 72)
      await row.getByRole('button', { name: new RegExp(`^${prefix}`) }).click()
      // Framed once in place: the menu opens at the window's corner, then moves under its button.
      const menu = page.getByRole('menu')
      await menu.waitFor()
      await menu.evaluate(element => Promise.all(element.getAnimations().map(({ finished }) => finished)))
    },
    // The section's row, with its name and who sees it, and the menu below it.
    frame: page => [page.locator('tr:has(button[aria-haspopup="menu"][data-state="open"])'), page.getByRole('menu')],
    margin: 10,
    viewport: { width: 1100 },
  },
  {
    // board-reads: the « Lectures » panel of a document, opened from its « Lu par » figure.
    id: 'board-reads-panel',
    account: MARC,
    path: '/board/documents',
    prepare: async page => {
      await page.locator('a[href*="lectures="]:visible').first().click()
      await settledPanel(page)
    },
    frame: page => [sidePanel(page)],
    margin: -1,
    viewport: { width: 1600, height: 900 },
  },
]

/** Waits for the docked side panel to finish sliding in: framed before, the crop would cut its right side. */
async function settledPanel(page: Page): Promise<void> {
  const panel = sidePanel(page)
  await panel.waitFor()
  await panel.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(({ finished }) => finished)))
}

/** The docked side panel that a row or a block opens: labelled by its title, unlike the page's other asides. */
function sidePanel(page: Page): Locator {
  return page.locator('aside[aria-labelledby]')
}

/** The « … » of the first territory in the list, named after its number. */
function menuButton(page: Page, locale: HelpLocale): Locator {
  const prefix = m.territories_menu_label({ number: '' }, { locale })
  return page.getByRole('button', { name: new RegExp(`^${prefix}`) }).first()
}
