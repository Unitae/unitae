import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../app/database/generated/client'
import { PublisherType } from '../app/database/generated/enums'

// Populates the dev database with pioneers covering the main monitoring cases so the
// roster (/publishers/activity/pioneers) can be verified live. Idempotent: re-running
// removes the previously-seeded demo pioneers (lastname "Démo") first.
//
// Run with: pnpm exec tsx scripts/seed-pioneer-demo.ts
//
// It is date-relative: rows land in the *current* service year, so whenever you run it the
// pioneers show up on the default roster.

const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 5 })
const db = new PrismaClient({ adapter })

const BAPTISM = new Date('2010-06-01')
const DEMO_LASTNAME = 'Démo'

const now = new Date()
const currentServiceYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1

// idx 0 = September of the service year … 11 = August.
function syMonth(idx: number): { month: number; year: number } {
  const abs = currentServiceYear * 12 + 8 + idx
  return { month: ((abs % 12) + 12) % 12, year: Math.floor(abs / 12) }
}

// Completed months of the current service year (strictly before the current calendar month).
let elapsedCount = 0
for (let i = 0; i < 12; i++) {
  const m = syMonth(i)
  if (m.year < now.getFullYear() || (m.year === now.getFullYear() && m.month < now.getMonth())) elapsedCount++
}
const elapsed = Array.from({ length: elapsedCount }, (_, i) => i)

interface Row {
  month: number
  year: number
  hours: number
  studies: number
  type: PublisherType
}

function act(idx: number, hours: number, type: PublisherType, studies = 2): Row {
  const { month, year } = syMonth(idx)
  return { month, year, hours, studies, type }
}

const T = PublisherType

interface Scenario {
  firstname: string
  memberType: PublisherType
  rows: Row[]
}

// A prior-service-year pioneer row (Aug of the current calendar year of the SY start) —
// marks a "continuing" pioneer enrolled since September.
const priorYearRow: Row = { month: 7, year: currentServiceYear, hours: 50, studies: 1, type: T.PionnierPermanant }

const scenarios: Scenario[] = [
  // On pace at 50 h every month.
  {
    firstname: 'Marie·OnTrack',
    memberType: T.PionnierPermanant,
    rows: elapsed.map(i => act(i, 50, T.PionnierPermanant)),
  },
  // 50 h but skipped December — the missed month still counts (behind, not prorated).
  {
    firstname: 'Jean·MoisManquant',
    memberType: T.PionnierPermanant,
    rows: elapsed.filter(i => i !== 3).map(i => act(i, 50, T.PionnierPermanant)),
  },
  // Consistently under 50 h → behind.
  {
    firstname: 'Paul·EnRetard',
    memberType: T.PionnierPermanant,
    rows: elapsed.map(i => act(i, 35, T.PionnierPermanant)),
  },
  // Ahead of pace.
  {
    firstname: 'Sara·EnAvance',
    memberType: T.PionnierPermanant,
    rows: elapsed.map(i => act(i, 70, T.PionnierPermanant)),
  },
  // New mid-year appointment: first report in January (idx 4) → prorated to that start.
  {
    firstname: 'Luc·NouveauMiAnnée',
    memberType: T.PionnierPermanant,
    rows: elapsed.filter(i => i >= 4).map(i => act(i, 50, T.PionnierPermanant)),
  },
  // Continuing pioneer (prior-year row) who missed the September report this year → enrolled
  // since September, one month behind.
  {
    firstname: 'Anne·ContinueSansSept',
    memberType: T.PionnierPermanant,
    rows: [priorYearRow, ...elapsed.filter(i => i >= 1).map(i => act(i, 50, T.PionnierPermanant))],
  },
  // On pace but the latest expected month is unreported → "Rapport en retard" + escalation.
  {
    firstname: 'Marc·RapportEnRetard',
    memberType: T.PionnierPermanant,
    rows: elapsed.slice(0, -1).map(i => act(i, 50, T.PionnierPermanant)),
  },
  // Special pioneer at 100 h, on pace.
  { firstname: 'Rina·Spéciale', memberType: T.PionnierSpecial, rows: elapsed.map(i => act(i, 100, T.PionnierSpecial)) },
  // Missionary at 100 h, slightly behind.
  { firstname: 'Tom·Missionnaire', memberType: T.Missionnaire, rows: elapsed.map(i => act(i, 90, T.Missionnaire)) },
  // Auxiliary pioneer — informational, a few months, some met / some not (30 h standard).
  {
    firstname: 'Éric·Auxiliaire',
    memberType: T.PionnierAuxiliaires,
    rows: [act(2, 30, T.PionnierAuxiliaires), act(3, 22, T.PionnierAuxiliaires), act(5, 35, T.PionnierAuxiliaires)],
  },
  // Concluded: pioneered Sept–Nov, then reverted to a regular publisher in December.
  {
    firstname: 'Ève·Terminé',
    memberType: T.Normal,
    rows: [
      act(0, 50, T.PionnierPermanant),
      act(1, 50, T.PionnierPermanant),
      act(2, 50, T.PionnierPermanant),
      act(3, 0, T.Normal),
    ],
  },
]

async function main() {
  const congregation = await db.congregation.findFirst({ orderBy: { id: 'asc' } })
  if (!congregation) {
    throw new Error('No congregation found — seed the dev database first (pnpm prisma db seed).')
  }
  const congregationId = congregation.id

  // Remove any previously-seeded demo pioneers (and their activities) for idempotency.
  const existing = await db.member.findMany({
    where: { congregationId, lastname: DEMO_LASTNAME },
    select: { id: true },
  })
  const existingIds = existing.map(m => m.id)
  if (existingIds.length > 0) {
    await db.publisherActivity.deleteMany({ where: { publisherId: { in: existingIds } } })
    await db.member.deleteMany({ where: { id: { in: existingIds } } })
  }

  for (const scenario of scenarios) {
    const member = await db.member.create({
      data: {
        firstname: scenario.firstname,
        lastname: DEMO_LASTNAME,
        isPublisher: true,
        type: scenario.memberType,
        baptismDate: BAPTISM,
        congregationId,
      },
    })
    await db.publisherActivity.createMany({
      data: scenario.rows.map(r => ({
        month: r.month,
        year: r.year,
        hours: r.hours,
        studies: r.studies,
        type: r.type,
        isPublisher: true,
        publisherId: member.id,
        congregationId,
      })),
    })
  }

  const label = `sept. ${currentServiceYear} – août ${currentServiceYear + 1}`
  // biome-ignore lint/suspicious/noConsole: standalone dev script
  console.log(
    `Seeded ${scenarios.length} demo pioneers into "${congregation.name}" for service year ${label} (${elapsedCount} elapsed months).`,
  )
}

main()
  .catch(error => {
    // biome-ignore lint/suspicious/noConsole: standalone dev script
    console.error(error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
