import type { SheetPioneer } from '~/features/display-board/model/pioneers-sheet'
import type { ProgrammeSheetEvent, ProgrammeSheetPart } from '~/features/display-board/model/programme-sheet.type'
import type { SheetPublisherGroup } from '~/features/display-board/model/publisher-groups-sheet'
import type { OrganigramHolder, OrganigramNode } from '~/shared/domain/organigram.queries'

// Congregations as the sheets meet them: French names with accents, compound and very long
// surnames, a few from further away. Every person's name is unique, so a test can tell that each
// one was printed — 30 first names against 31 surnames never repeat a pair below 930 people.

const FIRST = [
  'Jean',
  'Marie',
  'Pierre',
  'Sophie',
  'Luc',
  'Isabelle',
  'Paul',
  'Nathalie',
  'Michel',
  'Catherine',
  'André',
  'Françoise',
  'Philippe',
  'Sylvie',
  'Alain',
  'Christine',
  'Bernard',
  'Valérie',
  'Daniel',
  'Monique',
  'Marie-Christine',
  'Jean-Baptiste',
  'Thérèse',
  'Grégoire',
  'Élodie',
  'Kévin',
  'Aminata',
  'Josué',
  'Łukasz',
  'Timothée',
]
const LAST = [
  'Martin',
  'Bernard',
  'Dubois',
  'Thomas',
  'Robert',
  'Richard',
  'Petit',
  'Durand',
  'Leroy',
  'Moreau',
  'Simon',
  'Laurent',
  'Lefebvre',
  'Michel',
  'Garcia',
  'David',
  'Bertrand',
  'Roux',
  'Vincent',
  'Fournier',
  'De La Fontaine-Beauregard',
  'Nguyễn',
  'Diallo',
  "N'Guessan",
  'Lopes Da Silva',
  'Morel',
  'Girard',
  'André',
  'Mercier',
  'Blanc',
  'Œuvray',
]

let nextPerson = 1

export function resetPeople() {
  nextPerson = 1
}

function person() {
  const index = nextPerson++
  return { id: index, firstname: FIRST[index % FIRST.length], lastname: LAST[index % LAST.length], anonymizedAt: null }
}

/** « Prénom NOM » as the sheets print it. */
export function printedName(someone: { firstname: string | null; lastname: string | null }): string {
  return [someone.firstname, someone.lastname?.toUpperCase()].filter(Boolean).join(' ')
}

// ── Publisher groups ───────────────────────────────────────────────────

const GROUP_NAMES = [
  ['Groupe Centre', '15 avenue Victor Hugo, 75017'],
  ['Groupe Nord', '42 rue de la République, 75017'],
  ['Groupe Sud', '8 rue de la Paix, 75017'],
  ['Groupe Est', '3 avenue de la Gare, 75018'],
  ['Groupe Ouest — Clichy-Levallois', '22 rue Jean Jaurès, 92110 Clichy'],
  ['Groupe Épinettes', '7 rue Lemercier, 75017'],
  ['Groupe Saint-Ouen', '120 avenue Gabriel Péri, 93400'],
  ['Groupe Monceau', '1 boulevard de Courcelles, 75008'],
]

export const GROUP_SETS = {
  '6x25': [25, 25, 25, 25, 25, 25],
  '6x20': [20, 20, 20, 20, 20, 20],
  demo: [10, 11, 9, 10, 9],
  '8-real': [14, 22, 18, 12, 24, 16, 9, 20],
  '2x80': [12, 80],
} as const

/** Groups of these sizes, leaders included; every third group has no adjoint. */
export function publisherGroups(sizes: readonly number[]): SheetPublisherGroup[] {
  return sizes.map((size, index) => {
    const responsible = person()
    const deputy = index % 3 === 2 ? null : person()
    const members = Array.from({ length: Math.max(0, size - (deputy ? 2 : 1)) }, person)
    const [name, adress] = GROUP_NAMES[index % GROUP_NAMES.length]
    return { id: 1000 + index, name, adress, responsible, deputy, members }
  })
}

// ── Pioneers ───────────────────────────────────────────────────────────

export function pioneerList(permanent: number, special: number, auxiliary: number): SheetPioneer[] {
  const make = (type: string, count: number) => Array.from({ length: count }, () => ({ ...person(), type }))
  return [
    ...make('PionnierPermanant', permanent),
    ...make('PionnierSpecial', special),
    ...make('PionnierAuxiliaires', auxiliary),
  ]
}

// ── Organigram ─────────────────────────────────────────────────────────

let nextNode = 1

function holder(kind: string, isElder = true): OrganigramHolder {
  const { id, firstname, lastname } = person()
  return { roleId: 0, memberId: id, firstname, lastname, anonymizedAt: null, kind, isElder }
}

function node(name: string, over: Partial<OrganigramNode> = {}): OrganigramNode {
  const id = nextNode++
  return {
    id,
    key: `n${id}`,
    name,
    note: null,
    isRoster: false,
    isSinglePerson: false,
    holders: [],
    children: [],
    ...over,
  }
}

function service(name: string, members: number, deputy = true): OrganigramNode {
  return node(name, {
    holders: [
      holder('leader'),
      ...(deputy ? [holder('deputy', false)] : []),
      ...Array.from({ length: members }, () => holder('member', false)),
    ],
  })
}

/** The standard chart; `scale` multiplies its services and its rosters, for a large congregation. */
export function organigramTree(scale = 1): OrganigramNode[] {
  const services = (names: string[]) =>
    Array.from({ length: scale }, (_, round) =>
      names.map(name => service(scale > 1 ? `${name} ${round + 1}` : name, 3, round % 2 === 0)),
    ).flat()
  const post = (name: string, key: string, children: OrganigramNode[]) =>
    node(name, { key, isSinglePerson: true, holders: [holder('leader')], children })
  const committee = node('Comité de service', {
    key: 'service-committee',
    children: [
      post(
        'Coordinateur',
        'coordinator',
        services(['Programme Réunion Publique', 'Service Accueil', 'Sonorisation et vidéo']),
      ),
      post('Secrétaire', 'secretary', services(['Comptes', 'Publications', 'Territoires'])),
      post('Surveillant du service', 'service-overseer', services(['Prédication publique'])),
    ],
  })
  const elders = node('Anciens', {
    key: 'elder',
    isRoster: true,
    holders: Array.from({ length: 9 * scale }, () => holder('member')),
    children: [
      committee,
      node('Coordinateur Nettoyage', { isSinglePerson: true, holders: [holder('leader')] }),
      ...services(['Entretien de la Salle du Royaume']),
    ],
  })
  const assistants = node('Assistants', {
    key: 'assistant-servant',
    isRoster: true,
    holders: Array.from({ length: 11 * scale }, () => holder('member', false)),
  })
  return [elders, assistants]
}

// ── Programme ──────────────────────────────────────────────────────────

let nextPart = 1

function member() {
  const { firstname, lastname } = person()
  return { firstname, lastname, anonymizedAt: null }
}

function part(
  order: number,
  section: string,
  name: string,
  topic: string,
  durationMin: number | null,
  over: Partial<ProgrammeSheetPart> = {},
): ProgrammeSheetPart {
  return {
    id: nextPart++,
    name,
    section,
    track: '',
    order,
    topic,
    durationMin,
    assignee: member(),
    assistant: null,
    externalSpeaker: null,
    ...over,
  }
}

const SERVICES = ['Accueil', 'Accueil (entrée)', 'Sonorisation', 'Vidéo / Zoom', 'Micros', 'Micros', 'Plateforme']

function midweek(date: string): ProgrammeSheetEvent {
  const [J, A, V] = ['Joyaux de la Parole de Dieu', 'Applique-toi au ministère', 'Vie chrétienne']
  return {
    name: 'Réunion Vie et ministère',
    startDate: new Date(`${date}T17:00:00Z`),
    templateId: 1,
    template: { name: 'Réunion Vie et ministère' },
    eventParts: [
      part(1, '', 'Président', 'Cantique 76 et prière · Paroles d’introduction', 1),
      part(2, J, 'Discours', '« Restez éveillés et faites preuve de discernement »', 10),
      part(3, J, 'Perles spirituelles', 'Perles spirituelles', 10),
      part(4, J, 'Lecture de la Bible', 'Lecture de la Bible', 4, { track: 'Salle principale' }),
      part(4, J, 'Lecture de la Bible', 'Lecture de la Bible', 4, { track: 'Salle B' }),
      part(5, A, 'Engage la conversation', 'Engage la conversation (de maison en maison)', 3, { assistant: member() }),
      part(5, A, 'Engage la conversation', 'Engage la conversation (de maison en maison)', 3, {
        assistant: member(),
        track: 'Salle B',
      }),
      part(6, A, 'Entretiens l’intérêt', 'Entretiens l’intérêt (témoignage informel)', 4, { assistant: member() }),
      part(6, A, 'Entretiens l’intérêt', 'Entretiens l’intérêt (témoignage informel)', 4, {
        assignee: null,
        track: 'Salle B',
      }),
      part(7, A, 'Discours', 'Explique tes croyances — Discours', 5),
      part(8, V, 'Partie', 'Cantique 101 · « Nos besoins locaux »', 15),
      part(9, V, 'Étude biblique de l’assemblée', 'Étude biblique de l’assemblée', 30, { assistant: member() }),
      part(10, V, 'Prière', 'Paroles de conclusion · Cantique 52 et prière', 3),
    ],
    eventServiceParts: SERVICES.map(name => ({ name, assignee: member() })),
  }
}

function weekend(date: string): ProgrammeSheetEvent {
  return {
    name: 'Réunion publique',
    startDate: new Date(`${date}T08:00:00Z`),
    templateId: 2,
    template: { name: 'Réunion publique' },
    eventParts: [
      part(1, '', 'Président', 'Président', null),
      part(2, '', 'Discours public', '« Peut-on vraiment faire confiance à la Bible aujourd’hui ? »', 30, {
        assignee: null,
        externalSpeaker: { name: 'Frère Olivier Lemaître (Assemblée de Nanterre)' },
      }),
      part(3, '', 'Étude de La Tour de Garde', 'Étude de La Tour de Garde', 60, { assistant: member() }),
    ],
    eventServiceParts: SERVICES.map(name => ({ name, assignee: member() })),
  }
}

/** October and November 2026: every Sunday and every Wednesday. */
export function programmeEvents(): ProgrammeSheetEvent[] {
  const days = Array.from({ length: 61 }, (_, offset) => new Date(Date.UTC(2026, 9, 1 + offset)))
  return days.flatMap(day => {
    const date = day.toISOString().slice(0, 10)
    if (day.getUTCDay() === 0) return [weekend(date)]
    if (day.getUTCDay() === 3) return [midweek(date)]
    return []
  })
}

/** Every person a programme prints, as the sheet prints them. */
export function programmeNames(events: ProgrammeSheetEvent[]): string[] {
  return events.flatMap(event => [
    ...event.eventParts.flatMap(eventPart =>
      [eventPart.assignee, eventPart.assistant].flatMap(someone => (someone ? [printedName(someone)] : [])),
    ),
    ...(event.eventServiceParts ?? []).flatMap(each => (each.assignee ? [printedName(each.assignee)] : [])),
  ])
}
