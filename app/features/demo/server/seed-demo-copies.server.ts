// Fills the demo copies the control plane creates (docs/development/specs/demo-mode.md). Run by /cron/demo-seed.

import { seedDemoCongregation } from '~/database/demo/seed-demo'
import { isDemoModeEnabled } from '~/features/demo/server/demo-mode.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('demo')

/** Copies filled per run: a seed takes about 4 seconds, the cron runs every minute. */
const PER_RUN = 5

/**
 * Seeds every copy that isn't ready yet, a few per run, and marks each ready once its seed finished. A copy whose seed
 * failed stays not ready, so it's never handed to a visitor; the control plane deletes it with the expired ones.
 */
export async function seedPendingDemoCopies(now: Date = new Date()): Promise<number> {
  if (!isDemoModeEnabled()) return 0
  const pending = await unscopedDb.congregation.findMany({
    where: { demoExpiresAt: { not: null }, demoReadyAt: null },
    select: { id: true, name: true, slug: true },
    orderBy: { id: 'asc' },
    take: PER_RUN,
  })
  let seeded = 0
  for (const copy of pending) {
    try {
      // The slug is unique: suffixed with it, the copy's login addresses are too.
      await seedDemoCongregation(unscopedDb, copy, {
        now,
        emailSuffix: copy.slug,
        demoLogins: true,
        sharedBoardFiles: true,
      })
      await unscopedDb.congregation.update({ where: { id: copy.id }, data: { demoReadyAt: now } })
      seeded++
    } catch (error) {
      logger.error(`Demo copy ${copy.id} could not be seeded`, { error })
    }
  }
  return seeded
}
