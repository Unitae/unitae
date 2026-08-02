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
  const failed: { id: number; name: string; error: unknown }[] = []

  // Each congregation is its own transaction (atomic — a mid-congregation throw rolls that congregation
  // back). A failure is logged and the run continues, so one bad tenant never blocks the rest; a re-run
  // is a no-op for the ones that succeeded.
  for (const congregation of congregations) {
    try {
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
    } catch (error) {
      failed.push({ id: congregation.id, name: congregation.name, error })
      // biome-ignore lint/suspicious/noConsole: standalone deploy script
      console.error(`  ❌ ${congregation.name} (#${congregation.id}) failed and was rolled back:`, error)
    }
  }

  // biome-ignore lint/suspicious/noConsole: standalone deploy script
  console.log(
    `Backfill complete: ${totalStints} enrolment(s) written for ${totalMembers} member(s) across ${congregations.length - failed.length}/${congregations.length} congregation(s).`,
  )
  if (failed.length > 0) {
    // biome-ignore lint/suspicious/noConsole: standalone deploy script
    console.error(
      `${failed.length} congregation(s) failed: ${failed.map(f => `#${f.id}`).join(', ')} — re-run after fixing.`,
    )
    process.exit(1)
  }
}

main()
  .catch(error => {
    // biome-ignore lint/suspicious/noConsole: standalone deploy script
    console.error(error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
