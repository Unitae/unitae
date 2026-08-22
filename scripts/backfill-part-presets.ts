import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../app/database/generated/client'
import { backfillCongregationPartPresets } from '../app/features/events/server/backfill-part-presets.server'
import { seedDefaultPartPresets } from '../app/features/events/server/seed-part-presets.server'

// Links existing programme parts to the preset describing their kind, seeding
// the system presets first for congregations created before they existed.
//
// Safe to re-run: seeding skips presets that exist, and the backfill only
// touches parts whose presetId is still null, so manual corrections survive.

const adapter = new PrismaPg({ connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL, max: 5 })
const db = new PrismaClient({ adapter })

async function main() {
  const congregations = await db.congregation.findMany({ select: { id: true, name: true, locale: true } })
  let linked = 0
  let unmatched = 0
  const failed: { id: number; name: string; error: unknown }[] = []

  for (const congregation of congregations) {
    try {
      // One transaction per congregation: a failure rolls back only that one.
      const result = await db.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregation.id)}'`)
        const locale = congregation.locale === 'en' ? 'en' : 'fr'
        await seedDefaultPartPresets(tx, congregation.id, locale)
        return backfillCongregationPartPresets(tx, congregation.id, locale)
      })

      linked += result.templateParts + result.eventParts
      unmatched += result.unmatched
      // biome-ignore lint/suspicious/noConsole: standalone deploy script
      console.log(
        `  ${congregation.name} (#${congregation.id}): ` +
          `${result.templateParts} template part(s), ${result.eventParts} event part(s) linked, ` +
          `${result.unmatched} left for manual review`,
      )
    } catch (error) {
      failed.push({ id: congregation.id, name: congregation.name, error })
      // biome-ignore lint/suspicious/noConsole: standalone deploy script
      console.error(`  ❌ ${congregation.name} (#${congregation.id}) failed and was rolled back:`, error)
    }
  }

  // biome-ignore lint/suspicious/noConsole: standalone deploy script
  console.log(
    `\nBackfill complete: ${linked} part(s) linked across ` +
      `${congregations.length - failed.length}/${congregations.length} congregation(s).`,
  )

  // Reported loudly rather than buried: these are the ministry parts and songs
  // the matcher refuses to guess at, and someone has to set them by hand.
  if (unmatched > 0) {
    // biome-ignore lint/suspicious/noConsole: standalone deploy script
    console.log(
      `${unmatched} part(s) could not be identified from their name and still have no preset. ` +
        `This is expected for the ministry parts and songs — set those in the programme editor.`,
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
