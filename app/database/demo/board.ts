import { GROUPS, MEETINGS } from './profile'

export type BoardBlock = { kind: 'paragraph'; text: string } | { kind: 'table'; head: string[]; rows: string[][] }

export interface BoardDocumentSeed {
  title: string
  highlighted: boolean
  /** Posted this many days ago. */
  age: number
  blocks: BoardBlock[]
}

export interface BoardSection {
  name: string
  documents: BoardDocumentSeed[]
}

export interface BoardContext {
  /** The family that hosts a meeting for field service. */
  host: string
  /** The coming public talks, as the weekend programme gives them. */
  talks: { date: Date; title: string; speaker: string }[]
}

const DAY = 24 * 60 * 60 * 1000
// The demo congregation is French, and so is what it posts: its dates are written in French, in Paris.
const LOCALE = 'fr-FR'
const ZONE = 'Europe/Paris'
const FIRST_OF_MONTH_LONG = /^(\S+) 1 /
const FIRST_OF_MONTH = /^1 /

const P = (text: string): BoardBlock => ({ kind: 'paragraph', text })
const table = (head: string[], rows: string[][]): BoardBlock => ({ kind: 'table', head, rows })

const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(LOCALE, { timeZone: ZONE, ...options }).format(date)
/** « mardi 1er décembre », as a notice writes it. */
const weekdayDate = (date: Date) =>
  format(date, { weekday: 'long', day: 'numeric', month: 'long' }).replace(FIRST_OF_MONTH_LONG, '$1 1er ')
/** « 1er décembre ». */
const dayMonth = (date: Date) => format(date, { day: 'numeric', month: 'long' }).replace(FIRST_OF_MONTH, '1er ')
/** « 16 nov. », for a table's date column. */
const shortDate = (date: Date) => format(date, { day: 'numeric', month: 'short' }).replace(FIRST_OF_MONTH, '1er ')

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY)

/** The first given weekday (0 for Sunday) on or after a date, at noon. */
function onOrAfter(date: Date, weekDay: number): Date {
  const day = new Date(date)
  day.setHours(12, 0, 0, 0)
  day.setDate(day.getDate() + ((weekDay - day.getDay() + 7) % 7))
  return day
}

/** The weeks from this one, by their Monday. */
const weeksFrom = (now: Date, count: number) =>
  Array.from({ length: count }, (_, week) => addDays(onOrAfter(addDays(now, -6), 1), week * 7))

/**
 * What the congregation posts on its board, section by section: neutral pages any congregation would post, never an
 * official letter's text. Everything is dated from today, and nothing it announces contradicts the programme the demo
 * plans: the new meeting times start after the last weekend it lists, the overseer's visit falls past the midweek
 * meetings already assigned.
 */
export function boardDocuments(now: Date, { host, talks }: BoardContext): BoardSection[] {
  const newTimes = onOrAfter(addDays(now, MEETINGS.weekendFutureWeeks * 7 + 1), 0)
  const visit = onOrAfter(addDays(now, MEETINGS.midweekFutureWeeks * 7 + 7), 2)
  const assembly = onOrAfter(addDays(now, 12 * 7), 0)
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 12)
  const monthTitle = format(lastMonth, { month: 'long', year: 'numeric' })
  const [centre, north, south, east, west] = GROUPS

  return [
    {
      name: 'Annonces',
      documents: [
        {
          title: 'Changement d’horaire des réunions',
          highlighted: true,
          age: 1,
          blocks: [
            P(
              `À partir du ${weekdayDate(newTimes)}, la réunion du week-end aura lieu le dimanche à 10 h, au lieu du samedi à 17 h. La réunion de semaine reste le jeudi à 19 h.`,
            ),
            P(
              'Les groupes de prédication du samedi matin gardent leur horaire habituel. Merci de prévoir l’accueil des personnes intéressées à la nouvelle heure.',
            ),
            table(
              ['Réunion', `Jusqu’au ${shortDate(addDays(newTimes, -1))}`, `À partir du ${shortDate(newTimes)}`],
              [
                ['Semaine', 'jeudi 19 h', 'jeudi 19 h'],
                ['Week-end', 'samedi 17 h', 'dimanche 10 h'],
              ],
            ),
          ],
        },
        {
          title: 'Lettre du Collège central',
          highlighted: false,
          age: 3,
          blocks: [
            P('Document d’exemple : le texte de la lettre lue à l’assemblée figure ici, tel qu’il a été reçu.'),
            P('Il reste consultable sur le tableau aussi longtemps que nécessaire, puis il est archivé.'),
          ],
        },
        {
          title: 'Rappel : covoiturage pour l’assemblée de circonscription',
          highlighted: false,
          age: 6,
          blocks: [
            P(
              `Pour l’assemblée de circonscription du ${weekdayDate(assembly)}, les responsables de groupe organisent le covoiturage. Signalez-leur les places libres dans votre voiture, ou votre besoin d’être conduit, avant le ${dayMonth(addDays(assembly, -14))}.`,
            ),
          ],
        },
      ],
    },
    {
      name: 'Programmes',
      documents: [
        {
          title: 'Programme des discours publics',
          highlighted: false,
          age: 9,
          blocks: [
            table(
              ['Date', 'Thème', 'Orateur'],
              talks.slice(0, 6).map(talk => [shortDate(talk.date), talk.title, talk.speaker]),
            ),
          ],
        },
        {
          title: 'Assemblée de circonscription',
          highlighted: true,
          age: 2,
          blocks: [
            P(
              `L’assemblée de circonscription aura lieu le ${weekdayDate(assembly)} à la salle d’assemblées. Accueil à partir de 8 h 45, programme de 9 h 40 à 16 h.`,
            ),
            P(
              'Le parking est limité : pensez au covoiturage. Les volontaires pour le nettoyage se signalent auprès de leur responsable de groupe.',
            ),
          ],
        },
      ],
    },
    {
      name: 'Prédication',
      documents: [
        {
          title: 'Rendez-vous de prédication',
          highlighted: false,
          age: 12,
          blocks: [
            table(
              ['Jour', 'Heure', 'Lieu', 'Groupes'],
              [
                ['Mardi', '9 h 30', 'Salle du Royaume', 'tous'],
                ['Mercredi', '14 h', `Chez la famille ${host}`, `${centre}, ${north}`],
                ['Samedi', '9 h 30', 'Salle du Royaume', 'tous'],
                ['Samedi', '9 h 30', 'Square des Lilas', `${east}, ${west}`],
                ['Dimanche', '14 h 30', 'Salle du Royaume', south],
              ],
            ),
          ],
        },
        {
          title: 'Planning TPL',
          highlighted: false,
          age: 15,
          blocks: [
            table(
              ['Semaine', 'Lieu', 'Créneau'],
              weeksFrom(now, 6).map((week, index) => [
                shortDate(week),
                ['Gare', 'Marché', 'Gare', 'Place de la mairie', 'Marché', 'Gare'][index] as string,
                [
                  'mar. 8 h–10 h',
                  'sam. 9 h–11 h',
                  'jeu. 17 h–19 h',
                  'mer. 10 h–12 h',
                  'sam. 9 h–11 h',
                  'ven. 8 h–10 h',
                ][index] as string,
              ]),
            ),
          ],
        },
      ],
    },
    {
      name: 'Entretien',
      documents: [
        {
          title: 'Planning de nettoyage',
          highlighted: false,
          age: 20,
          blocks: [
            table(
              ['Semaine', 'Groupe', 'Grand nettoyage'],
              weeksFrom(now, 8).map((week, index) => [
                shortDate(week),
                `Groupe ${GROUPS[index % GROUPS.length]}`,
                index % 4 === 3 ? 'oui' : '—',
              ]),
            ),
          ],
        },
        {
          title: 'Consignes de sécurité',
          highlighted: false,
          age: 40,
          blocks: [
            P(
              'En cas d’alarme, les responsables de l’accueil dirigent l’assistance vers les sorties indiquées sur le plan affiché à l’entrée.',
            ),
            P(
              'Le point de rassemblement est sur le parking, côté rue. Ne revenez pas dans la salle avant l’autorisation des responsables.',
            ),
          ],
        },
        {
          title: 'Plan d’évacuation',
          highlighted: false,
          age: 41,
          blocks: [
            P('Document d’exemple : le plan de la salle, les sorties de secours et l’emplacement des extincteurs.'),
          ],
        },
      ],
    },
    {
      name: 'Comptes',
      documents: [
        {
          title: 'Rapport des comptes',
          highlighted: false,
          age: 8,
          blocks: [
            table(
              [monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1), 'Montant'],
              [
                [`Solde au ${dayMonth(lastMonth)}`, '3 412,50 €'],
                ['Offrandes reçues', '1 186,00 €'],
                ['Frais de fonctionnement', '-642,30 €'],
                ['Œuvre mondiale', '-500,00 €'],
                [`Solde au ${dayMonth(lastMonthEnd)}`, '3 456,20 €'],
              ],
            ),
          ],
        },
      ],
    },
    {
      name: 'Vie de l’assemblée',
      documents: [
        {
          title: 'Visite du responsable de circonscription',
          highlighted: false,
          age: 4,
          blocks: [
            P(
              `Le responsable de circonscription visitera l’assemblée du ${weekdayDate(visit)} au ${weekdayDate(addDays(visit, 5))}. Le programme des réunions de cette semaine-là est modifié.`,
            ),
            table(
              ['Jour', 'Rendez-vous'],
              [
                ['Mardi', 'Réunion de semaine, 19 h'],
                ['Samedi', 'Prédication, 9 h 30'],
                ['Samedi', 'Réunion du week-end, 17 h'],
              ],
            ),
          ],
        },
        {
          title: 'Accueil des nouveaux',
          highlighted: false,
          age: 25,
          blocks: [
            P(
              'Bienvenue aux familles arrivées ces derniers mois. Les responsables de groupe prennent contact pour présenter les rendez-vous de prédication et les horaires.',
            ),
          ],
        },
      ],
    },
  ]
}
