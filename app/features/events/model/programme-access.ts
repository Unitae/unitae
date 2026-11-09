import { EventStatus } from './event-status.type'

/** What the reader holds over the programmes: congregation-wide rights, and the templates they are responsible for. */
export interface ProgrammeViewer {
  /** Manage the programmes: edit and delete any of them. */
  canManage: boolean
  /** Publish the programmes, and put them back to draft. */
  canPublish: boolean
  /** Assign the parts and services of any programme. */
  canAssign: boolean
  /** The templates whose whole programme the reader runs. */
  programmeTemplateIds: number[]
  /** The templates whose services the reader runs, the whole-programme ones included. */
  serviceTemplateIds: number[]
}

export interface ProgrammeRights {
  /** Edit and delete it. */
  canEdit: boolean
  canPublish: boolean
  canAssignParts: boolean
  canAssignServices: boolean
  /** See it while it is a draft: whoever may act on it in any way. */
  canSeeDraft: boolean
}

/**
 * What the reader may do with one programme, by the rights its routes check: a right held congregation-wide, or the
 * responsibility of its template — the whole programme, or only its services.
 */
export function programmeRights(programme: { templateId: number | null }, viewer: ProgrammeViewer): ProgrammeRights {
  const runs = (templateIds: number[]) => programme.templateId != null && templateIds.includes(programme.templateId)
  const responsible = runs(viewer.programmeTemplateIds)
  const rights = {
    canEdit: viewer.canManage || responsible,
    canPublish: viewer.canPublish || responsible,
    canAssignParts: viewer.canAssign || responsible,
    canAssignServices: viewer.canAssign || runs(viewer.serviceTemplateIds),
  }
  return { ...rights, canSeeDraft: Object.values(rights).some(Boolean) }
}

/** A published programme opens for every reader of the programmes; a draft only for someone who may act on it. */
export function mayOpenEvent(
  status: string,
  rights: { canEdit: boolean; canPublish: boolean; canAssign: boolean; canAssignService: boolean },
): boolean {
  return status !== EventStatus.Draft || Object.values(rights).some(Boolean)
}
