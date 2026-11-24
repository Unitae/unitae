import type { BulkPublishPreview } from './bulk-publish-preview.type'

/**
 * What the bulk dialog says and does: how much publishes (draft schedules, and meetings without schedules as a whole),
 * how much stays a draft, and the meetings to send to bulk-release — only those with something to publish, so the
 * toast after it reports nothing the dialog did not announce.
 */
export function bulkPublishSummary(preview: BulkPublishPreview): { publish: number; held: number; eventIds: number[] } {
  const publish = preview.publish.length + preview.events.publish.length
  const held =
    preview.notYours.length +
    preview.conflicts.length +
    preview.empty.length +
    preview.awaiting.length +
    preview.events.awaiting.length +
    preview.events.notYours.length
  const eventIds = [
    ...new Set([
      ...preview.publish.map(schedule => schedule.eventId),
      ...preview.events.publish.map(event => event.id),
    ]),
  ]
  return { publish, held, eventIds }
}
