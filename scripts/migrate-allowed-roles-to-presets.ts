import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../app/database/generated/client'
import { migrateAllowedRolesToPresets } from '../app/features/events/server/migrate-allowed-roles.server'

// Lifts per-part allowed roles onto the preset that owns them, where every part
// using a kind already agrees.
//
// Optional and safe to skip: eligibility falls back to the part's own rows when
// a kind has none configured, so nothing breaks if this never runs. Re-running
// is a no-op for kinds already set.

const adapter = new PrismaPg({ connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL, max: 5 })
const db = new PrismaClient({ adapter })

async function main() {
  const congregations = await db.congregation.findMany({ select: { id: true, name: true } })
  let migrated = 0
  const conflicts: string[] = []
  const failed: { id: number; name: string; error: unknown }[] = []

  for (const congregation of congregations) {
    try {
      const result = await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('SELECT set_config($1, $2, true)', 'app.congregation_id', String(congregation.id))
        return migrateAllowedRolesToPresets(tx, congregation.id)
      })

      migrated += result.migrated
      for (const c of result.conflicts) {
        conflicts.push(`  ${congregation.name} (#${congregation.id}): "${c.preset}" / ${c.asKind}`)
      }
      // biome-ignore lint/suspicious/noConsole: standalone deploy script
      console.log(
        `  ${congregation.name} (#${congregation.id}): ${result.migrated} consolidated, ${result.conflicts.length} left alone`,
      )
    } catch (error) {
      failed.push({ id: congregation.id, name: congregation.name, error })
      // biome-ignore lint/suspicious/noConsole: standalone deploy script
      console.error(`  ❌ ${congregation.name} (#${congregation.id}) failed and was rolled back:`, error)
    }
  }

  // biome-ignore lint/suspicious/noConsole: standalone deploy script
  console.log(
    `\nDone: ${migrated} preset slot(s) consolidated across ${congregations.length - failed.length}/${congregations.length} congregation(s).`,
  )

  if (conflicts.length > 0) {
    // Not a failure. These kinds are used by parts that restrict differently,
    // so no single answer is correct and the parts keep their own rules.
    // biome-ignore lint/suspicious/noConsole: standalone deploy script
    console.log(
      `\n${conflicts.length} kind/slot pair(s) left to the parts because they disagree — set these by hand if you want them on the kind:\n${conflicts.join('\n')}`,
    )
  }

  if (failed.length > 0) {
    // biome-ignore lint/suspicious/noConsole: standalone deploy script
    console.error(`${failed.length} congregation(s) failed — re-run after fixing.`)
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
