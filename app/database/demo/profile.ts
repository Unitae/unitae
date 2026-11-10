import type { Percentiles } from './random'

/**
 * The shape of the demo congregation: proportions and distributions measured on a real congregation of about 110
 * publishers (November 2026), so the demo looks and behaves like one. Only aggregates live here — counts, ratios,
 * percentiles and the role catalogue's job names — never a person, an address or a date of anyone.
 */

export const PEOPLE = {
  active: 111,
  brothers: 39,
  /** Households by size: most publishers live alone or as a couple. */
  householdSizes: { 1: 59, 2: 18, 3: 4, 4: 1 } as Record<number, number>,
  /** Ages of the active publishers, as weights per band (in years). */
  ageBands: { '8-12': 2, '13-17': 3, '18-29': 23, '30-49': 28, '50-69': 31, '70-90': 16 } as Record<string, number>,
  /** Age at baptism. */
  baptismAge: { 10: 15, 25: 16, 50: 19, 75: 26, 90: 36 } satisfies Percentiles,
  unbaptizedAdults: 3,
  elders: 8,
  servants: 9,
  anointed: 1,
  inactive: 2,
  regularPioneers: 32,
  withoutBirthDate: 8,
  withoutPhone: 3,
  withoutEmail: 11,
  dpaCardUpToDate: 12,
  survivalBackpackReady: 17,
  /** How many emergency contacts the publishers who gave some have: 1, 2 or 4. */
  emergencyContacts: { 1: 4, 2: 10, 4: 2 } as Record<number, number>,
  recentArrivals: 3,
  pastoralVisits: 6,
  /** Former publishers: those who left within the retention window keep their name, the others are anonymised. */
  left: 37,
  anonymized: 22,
  /** Share of active publishers with a login, and of logins with a verified email. */
  withAccount: 0.92,
  verified: 0.78,
} as const

export const GROUPS = ['Centre', 'Nord', 'Sud', 'Est', 'Ouest'] as const

export const ACTIVITY = {
  /** Months of reports, ending with the last ended month. */
  months: 26,
  /** Of the active publishers, the share whose report is in for a given past month, and for the month just ended. */
  filedRate: 0.97,
  lastMonthFiledRate: 0.9,
  didNotPreachRate: 0.02,
  regularHours: { 10: 13, 25: 21, 50: 34, 75: 50, 90: 58 } satisfies Percentiles,
  auxiliaryHours: { 10: 15, 25: 15, 50: 19, 75: 30, 90: 31 } satisfies Percentiles,
  creditHours: { 10: 3, 25: 8, 50: 15, 75: 25, 90: 39 } satisfies Percentiles,
  creditHoursRate: 0.07,
  studiesRate: 0.11,
  /** Auxiliary pioneering by calendar month (0 = January): spring around the Memorial, and September. */
  auxiliaryByMonth: { 0: 8, 1: 10, 2: 45, 3: 42, 4: 26, 5: 29, 6: 8, 7: 4, 8: 74, 9: 17, 10: 32, 11: 36 } as Record<
    number,
    number
  >,
  /** Auxiliary pioneers per month, on average. */
  auxiliaryPerMonth: 13,
  /** Regular pioneers who stopped within the history. */
  formerRegularPioneers: 11,
} as const

export const TERRITORIES = {
  classical: 314,
  commerces: 20,
  entrancesPerClassical: { 10: 2, 25: 2, 50: 4, 75: 5, 90: 7 } satisfies Percentiles,
  entrancesPerCommerces: { 10: 6, 25: 6, 50: 7, 75: 7, 90: 7 } satisfies Percentiles,
  /** Entrances known from open data but in no territory yet: what « Créer en lot » works on. */
  freeEntrances: 1800,
  homesPerBuilding: { 10: 1, 25: 10, 50: 18, 75: 30, 90: 46 } satisfies Percentiles,
  /** Share of territory buildings with a survey, and how many days ago it was. */
  surveyedRate: 0.85,
  freeSurveyedRate: 0.6,
  surveyAgeDays: { 10: 290, 25: 656, 50: 892, 75: 1447, 90: 1471 } satisfies Percentiles,
  pmrRate: 0.05,
  openEarlyRate: 0.01,
  mailboxOpenRate: 0.003,
  /** How a surveyed residential entrance is entered: 1 interphone, 2 sonnette, 4 code. */
  access: { 1: 80, 2: 8, 4: 12 } as Record<number, number>,
  shopKinds: {
    'restauration-snack-café': 158,
    autre: 61,
    alimentaire: 54,
    'coiffure-cosmetiques': 31,
    'santé-optique': 25,
    technologie: 18,
    maison: 11,
    'tabac-presse-librairie': 10,
    'vetements-chaussures': 6,
    'station-service': 5,
  } as Record<string, number>,
} as const

export const ATTRIBUTIONS = {
  /** Months of attribution history. */
  months: 21,
  /** Attributions per territory over the history. */
  perTerritory: { 1: 17, 2: 47, 3: 145, 4: 100, 5: 22, 6: 3 } as Record<number, number>,
  durationDays: { 10: 5, 25: 17, 50: 30, 75: 122, 90: 153 } satisfies Percentiles,
  openAgeDays: { 10: 13, 25: 28, 50: 74, 75: 124, 90: 174 } satisfies Percentiles,
  /** Share of territories out with a publisher today. */
  openRate: 0.42,
} as const

export const MEETINGS = {
  /** Thursday evening and Saturday afternoon, Europe/Paris. */
  midweek: { weekDay: 4, start: '19:00', end: '20:45' },
  weekend: { weekDay: 6, start: '17:00', end: '18:45' },
  pastWeeks: 24,
  midweekFutureWeeks: 8,
  weekendFutureWeeks: 18,
  /** Service roles stay unfilled beyond this many weeks ahead. */
  servicesPlannedWeeks: 4,
  /** Public talks given by a visiting speaker. */
  externalTalkRate: 0.73,
  externalSpeakers: 39,
  /** Absences (day-off events) per login that has any, and their length in days. */
  absenceAccountsRate: 0.6,
  absencesPerAccount: { 10: 1, 25: 2, 50: 4, 75: 8, 90: 13 } satisfies Percentiles,
  absenceDays: { 10: 2, 25: 2, 50: 5, 75: 14, 90: 24 } satisfies Percentiles,
} as const

/** The service roles of each meeting, as the congregation runs them. */
export const SERVICE_ROLES = [
  { key: 'welcome-door', name: 'Accueil (porte)', role: 'accueil-porte' },
  { key: 'welcome-hall', name: 'Accueil (auditorium)', role: 'accueil-auditorium' },
  { key: 'welcome-zoom', name: 'Accueil (zoom)', role: 'accueil-zoom' },
  { key: 'stage', name: 'Estrade', role: 'estrade' },
  { key: 'mic-left', name: 'Perchiste (gauche)', role: 'micros' },
  { key: 'mic-right', name: 'Perchiste (droite)', role: 'micros' },
  { key: 'sound-audio', name: 'Sono (audio)', role: 'sono' },
  { key: 'sound-video', name: 'Sono (vidéo)', role: 'sono' },
] as const

/** Who may hold a role: an elder, an elder or servant, a baptized brother, any brother, any baptized publisher. */
export type Eligibility = 'elder' | 'appointed' | 'brother' | 'young-brother' | 'publisher'

export interface CustomRole {
  key: string
  name: string
  /** The role it answers to in the organigram; none for the speaker and reader lists. */
  parent: string | null
  single?: boolean
  holders: number
  eligibility: Eligibility
  permissions?: string[]
}

/** The congregation's own roles: the speaker and reader lists, then the services of the organigram. */
export const CUSTOM_ROLES: CustomRole[] = [
  { key: 'rpp', name: 'RPP', parent: null, holders: 18, eligibility: 'brother' },
  { key: 'prieres-publiques', name: 'Prières publiques', parent: null, holders: 23, eligibility: 'brother' },
  { key: 'visite-pastorale', name: 'Visite pastorale', parent: null, holders: 12, eligibility: 'appointed' },
  { key: 'lecture-eba-tg', name: 'Lecteurs EBA/TG', parent: null, holders: 22, eligibility: 'brother' },
  { key: 'joyaux', name: 'Orateurs Joyaux', parent: null, holders: 13, eligibility: 'appointed' },
  { key: 'perles', name: 'Orateurs Perles', parent: null, holders: 15, eligibility: 'brother' },
  { key: 'eba', name: 'Orateurs EBA', parent: null, holders: 8, eligibility: 'appointed' },
  { key: 'discours-publics', name: 'Orateurs DP', parent: null, holders: 10, eligibility: 'appointed' },
  { key: 'vcm', name: 'Orateurs VCM', parent: null, holders: 14, eligibility: 'appointed' },
  { key: 'president-dp-tg', name: 'Présidents DP/TG', parent: null, holders: 16, eligibility: 'brother' },
  { key: 'president-vcm', name: 'Présidents VCM', parent: null, holders: 8, eligibility: 'elder' },
  { key: 'accueil', name: 'Service Accueil', parent: 'coordinator', holders: 2, eligibility: 'appointed' },
  { key: 'accueil-porte', name: 'Porte', parent: 'accueil', holders: 20, eligibility: 'young-brother' },
  { key: 'accueil-auditorium', name: 'Auditorium', parent: 'accueil', holders: 20, eligibility: 'young-brother' },
  {
    key: 'coordinateur-discours-publics',
    name: 'Coordinateur du programme des discours publics',
    parent: 'coordinator',
    single: true,
    holders: 1,
    eligibility: 'elder',
    permissions: ['can-view-absences', 'can-view-external-speakers'],
  },
  {
    key: 'responsable-programmes-services',
    name: 'Responsable du programme des services',
    parent: 'coordinateur-discours-publics',
    single: true,
    holders: 1,
    eligibility: 'brother',
    permissions: ['can-view-programs'],
  },
  {
    key: 'service-audio-video',
    name: 'Service Audio/Vidéo',
    parent: 'coordinator',
    holders: 2,
    eligibility: 'brother',
  },
  { key: 'micros', name: 'Perches', parent: 'service-audio-video', holders: 25, eligibility: 'young-brother' },
  { key: 'estrade', name: 'Scène', parent: 'service-audio-video', holders: 12, eligibility: 'young-brother' },
  { key: 'sono', name: 'Sono', parent: 'service-audio-video', holders: 9, eligibility: 'brother' },
  { key: 'accueil-zoom', name: 'Zoom', parent: 'service-audio-video', holders: 21, eligibility: 'young-brother' },
  {
    key: 'territoires',
    name: 'Service Territoires',
    parent: 'service-overseer',
    holders: 1,
    eligibility: 'brother',
    permissions: [
      'can-configure-territory-settings',
      'can-manage-buildings',
      'can-manage-territories',
      'can-manage-territory-attributions',
      'can-manage-territory-campaigns',
      'can-plan-territory-splits',
      'can-record-prospection',
      'can-view-prospection',
      'can-view-territories',
      'can-view-territory-attributions',
    ],
  },
  {
    key: 'prospection',
    name: 'Prospection',
    parent: 'territoires',
    holders: 17,
    eligibility: 'publisher',
    permissions: ['can-record-prospection', 'can-view-prospection'],
  },
  { key: 'publications', name: 'Service Publications', parent: 'service-overseer', holders: 2, eligibility: 'brother' },
  { key: 'tpl', name: 'Service TPL', parent: 'service-overseer', holders: 3, eligibility: 'publisher' },
  { key: 'compte', name: 'Service Comptes', parent: 'secretary', holders: 2, eligibility: 'appointed' },
  {
    key: 'conducteur-tour-de-garde',
    name: "Conducteur de l'étude de la Tour de Garde",
    parent: 'elder',
    single: true,
    holders: 1,
    eligibility: 'elder',
    permissions: [
      'can-manage-program-templates',
      'can-publish-programs',
      'can-view-absences',
      'can-view-external-speakers',
    ],
  },
  {
    key: 'conseiller-enseignement',
    name: "Conseiller pour l'enseignement",
    parent: 'elder',
    single: true,
    holders: 1,
    eligibility: 'elder',
  },
  {
    key: 'responsable-vcm',
    name: 'Responsable Réunion Vie Chrétienne et Ministère',
    parent: 'elder',
    single: true,
    holders: 1,
    eligibility: 'elder',
    permissions: ['can-manage-program-templates', 'can-publish-programs', 'can-view-absences'],
  },
  {
    key: 'coordinateur-nettoyage',
    name: 'Coordinateur du nettoyage',
    parent: 'elder',
    single: true,
    holders: 1,
    eligibility: 'appointed',
  },
  {
    key: 'covoiturage',
    name: 'Covoiturage pour les compagnons âgés',
    parent: 'elder',
    holders: 1,
    eligibility: 'publisher',
  },
]

/** The congregation's settings, as the real one keeps them. */
export const SETTINGS: Record<string, string> = {
  'attribution-default-duration-months': '4',
  'attribution-default-duration-days': '120',
  'attribution-phone-duration-days': '90',
  'attribution-commerce-duration-days': '180',
  'prospection-validity': '24',
  'phone-territory-active': 'false',
  'map-tab-active': 'true',
  'pmr-active': 'true',
  'auxiliary-pioneer-profile-active': 'true',
}

export const BOARD = {
  sections: [
    {
      name: 'Annonces',
      documents: ['Lettre du Collège central', 'Changement d’horaire des réunions', 'Rappel : don de sang'],
    },
    {
      name: 'Programmes',
      documents: [
        'Programme Vie chrétienne et ministère',
        'Programme des discours publics',
        'Assemblée de circonscription',
      ],
    },
    { name: 'Prédication', documents: ['Rendez-vous de prédication', 'Planning TPL', 'Campagne spéciale'] },
    {
      name: 'Entretien',
      documents: ['Planning de nettoyage', 'Consignes de sécurité', 'Plan d’évacuation', 'Entretien des espaces verts'],
    },
    { name: 'Comptes', documents: ['Rapport des comptes'] },
    {
      name: 'Vie de l’assemblée',
      documents: ['Mémorial : invitations', 'Visite du responsable de circonscription', 'Accueil des nouveaux'],
    },
  ],
} as const
