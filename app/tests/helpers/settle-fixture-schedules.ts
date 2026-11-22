import { attachEventItems } from '~/features/events/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// A fixture that writes events and their parts straight to the tables, without the app's writers, leaves the parts
// outside any schedule. Readers decide what members may see by schedule (spec D46), so the fixture settles them as the
// writers would: each item in its event's schedule of its kind, each schedule with its event's status.

/**
 * Puts every item of the congregation's events in a schedule with its event's status, as the writers do. Call it
 * after the fixture's last write: it resets every schedule of the congregation to its event's status (one set by
 * hand is lost), and an event without items gets no schedule.
 */
export async function settleFixtureSchedules(db: TransactionClient, congregationId: number): Promise<void> {
  const events = await db.event.findMany({ where: { congregationId }, select: { id: true } })
  await attachEventItems(
    db,
    events.map(event => event.id),
    congregationId,
  )
}
