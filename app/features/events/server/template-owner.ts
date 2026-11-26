// Whose parts and services a template writer touches (6a-1c-2). A kind's, by its id: the type's page, the seeds, the
// imports and duplication write a kind's items. Or a schedule template's, from « Modèles de planning »: its items are
// its own, filed under the kind that uses it too when one does (`templateId`), under none when no kind does yet.

/** A kind's id, or a schedule template with the kind its items are also filed under (null when no kind uses it). */
export type ItemOwner = number | { scheduleTemplateId: number; templateId: number | null }

/**
 * The rows an owner's items are: a kind's by the kind. A schedule template's are its kind's rows in it, its kind's not
 * placed in one yet (the kind's writers leave that to syncTemplateScheduleTemplates), and the rows it holds under no
 * kind, made while no kind used it: a kind coming to use it does not hide them. Several kinds may use one schedule
 * template, each with rows of its own. A schedule template no kind uses has its own, by it alone.
 */
export function ownerWhere(owner: ItemOwner) {
  if (typeof owner === 'number') return { templateId: owner }
  const { scheduleTemplateId, templateId } = owner
  if (templateId == null) return { scheduleTemplateId }
  return {
    OR: [
      { templateId, scheduleTemplateId },
      { templateId, scheduleTemplateId: null },
      { templateId: null, scheduleTemplateId },
    ],
  }
}

/** What a new item of the owner carries. */
export function ownerData(owner: ItemOwner): { templateId: number | null; scheduleTemplateId?: number } {
  if (typeof owner === 'number') return { templateId: owner }
  return { templateId: owner.templateId, scheduleTemplateId: owner.scheduleTemplateId }
}

/** The kind the owner's items are filed under, whose schedule templates are synced after a write; null for none. */
export function ownerKind(owner: ItemOwner): number | null {
  return typeof owner === 'number' ? owner : owner.templateId
}
