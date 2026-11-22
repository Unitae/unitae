// Who is told when a programme is published.

// Descriptor for a single publisher who needs the "you are assigned"
// notification when the event flips to released. Computed from the event
// under the release tx and fired OUTSIDE the tx by fireReleaseNotifications.
export type NotifyTarget = {
  entityType: 'Item'
  entityId: number
  assignmentName: string
  memberId: number
  role: 'speaker' | 'reader' | 'servant'
}

type PartRow = { id: number; name: string; hasConflict: boolean; assigneeId: number | null; assistantId: number | null }
type ServicePartRow = { id: number; name: string; hasConflict: boolean; assigneeId: number | null }

/** Who a release tells « you are assigned »: each part's speaker and reader, each service's assignee. */
export function computeNotifyTargets(parts: PartRow[], services: ServicePartRow[]): NotifyTarget[] {
  const targets: NotifyTarget[] = []
  for (const part of parts) {
    if (part.assigneeId != null) {
      targets.push({
        entityType: 'Item',
        entityId: part.id,
        assignmentName: part.name,
        memberId: part.assigneeId,
        role: 'speaker',
      })
    }
    if (part.assistantId != null) {
      targets.push({
        entityType: 'Item',
        entityId: part.id,
        assignmentName: part.name,
        memberId: part.assistantId,
        role: 'reader',
      })
    }
  }
  for (const service of services) {
    if (service.assigneeId != null) {
      targets.push({
        entityType: 'Item',
        entityId: service.id,
        assignmentName: service.name,
        memberId: service.assigneeId,
        role: 'servant',
      })
    }
  }
  return targets
}
