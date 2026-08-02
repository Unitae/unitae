import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../app/database/generated/client'
import { backfillCongregationEnrolments } from '../app/features/publishers/server/pioneer-enrolment-backfill.server'

// One-off backfill: derive explicit PioneerEnrolment stints from each congregation's historical
// PublisherActivity rows (spec §6.1). Run ONCE after `prisma migrate deploy` in the deploy step —
// it is NOT part of the SQL migration because the run-grouping logic is TypeScript, not SQL.
//
// Run with: pnpm tsx scripts/backfill-pioneer-enrolments.ts
//
// Idempotent: members that already have enrolments are skipped, so a re-run is a no-op.

// actorId 0 = system (AuditLog.actorId is nullable and unconstrained — this is just a marker).
const SYSTEM_ACTOR_ID = 0

const adapter = new PrismaPg({ connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL, max: 5 })
const db = new PrismaClient({ adapter })

async function main() {
  const congregations = await db.congregation.findMany({ select: { id: true, name: true } })
  let totalMembers = 0
  let totalStints = 0

  for (const congregation of congregations) {
    const result = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregation.id)}'`)
      return backfillCongregationEnrolments(tx, congregation.id, SYSTEM_ACTOR_ID)
    })
    totalMembers += result.members
    totalStints += result.stints
    // biome-ignore lint/suspicious/noConsole: standalone deploy script
    console.log(
      `  ${congregation.name} (#${congregation.id}): ${result.stints} stint(s) from ${result.members} member(s)`,
    )
  }

  // biome-ignore lint/suspicious/noConsole: standalone deploy script
  console.log(
    `Backfill complete: ${totalStints} enrolment(s) written for ${totalMembers} member(s) across ${congregations.length} congregation(s).`,
  )
}

main()
  .catch(error => {
    // biome-ignore lint/suspicious/noConsole: standalone deploy script
    console.error(error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
