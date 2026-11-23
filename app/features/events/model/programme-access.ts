import { EventStatus } from './event-status.type'

/** A published programme opens for every reader of the programmes; a draft only for someone who may act on it. */
export function mayOpenEvent(
  status: string,
  rights: { canEdit: boolean; canPublish: boolean; canAssign: boolean; canAssignService: boolean },
): boolean {
  return status !== EventStatus.Draft || Object.values(rights).some(Boolean)
}
