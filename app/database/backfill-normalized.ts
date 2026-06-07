/**
 * One-shot backfill for the normalized search columns added by
 * `20260606000000_add_normalized_search_columns`.
 *
 * Run after `prisma migrate deploy` on any environment that had rows before
 * the migration added the columns:
 *
 *   pnpm tsx app/database/backfill-normalized.ts
 *
 * Idempotent — only touches rows whose normalized columns are still empty,
 * so re-running is safe. The migration itself does NOT backfill because
 * doing so in SQL would require the `unaccent` extension (managed Postgres
 * often refuses `CREATE EXTENSION` outside the bootstrap role). Instead we
 * reuse the same `stripDiacritics()` helper the runtime writes use.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { stripDiacritics } from '../shared/utils/strip-diacritics'
import { PrismaClient } from './generated/client'

const BATCH_SIZE = 500

async function backfillMembers(prisma: PrismaClient): Promise<number> {
  let total = 0
  for (;;) {
    const batch = await prisma.member.findMany({
      where: { OR: [{ firstnameNormalized: '' }, { lastnameNormalized: '' }] },
      select: { id: true, firstname: true, lastname: true },
      take: BATCH_SIZE,
    })
    if (batch.length === 0) break
    for (const member of batch) {
      await prisma.member.update({
        where: { id: member.id },
        data: {
          firstnameNormalized: stripDiacritics(member.firstname),
          lastnameNormalized: stripDiacritics(member.lastname),
        },
      })
    }
    total += batch.length
    console.log(`  · Members backfilled: ${total}`)
  }
  return total
}

async function backfillBuildings(prisma: PrismaClient): Promise<number> {
  let total = 0
  for (;;) {
    const batch = await prisma.building.findMany({
      where: { streetNormalized: '' },
      select: { id: true, street: true },
      take: BATCH_SIZE,
    })
    if (batch.length === 0) break
    for (const building of batch) {
      await prisma.building.update({
        where: { id: building.id },
        data: { streetNormalized: stripDiacritics(building.street) },
      })
    }
    total += batch.length
    console.log(`  · Buildings backfilled: ${total}`)
  }
  return total
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DB_URL })
  const prisma = new PrismaClient({ adapter })
  try {
    console.log('Backfilling normalized columns…')
    const members = await backfillMembers(prisma)
    const buildings = await backfillBuildings(prisma)
    console.log(`Done — Members: ${members}, Buildings: ${buildings}.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
