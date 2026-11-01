import * as m from '~/i18n/paraglide/messages'

export interface GroupLeaderCandidate {
  id: number
  responsibleFor: { id: number; name: string } | null
  deputyFor: { id: number; name: string } | null
}

/**
 * Which brothers the group form holds back, and why: those who already oversee or assist another
 * group. `currentGroupId` is the group being edited, whose own leaders stay selectable. The
 * server runs the same rule (assertGroupLeaders); this is what keeps the form from offering a
 * choice it would refuse.
 */
export function groupLeaderAvailability(candidates: GroupLeaderCandidate[], currentGroupId?: number) {
  const reasons = new Map<number, string>()
  for (const candidate of candidates) {
    const { responsibleFor, deputyFor } = candidate
    if (responsibleFor && responsibleFor.id !== currentGroupId) {
      reasons.set(candidate.id, m.groups_form_already_responsible({ name: responsibleFor.name }))
    } else if (deputyFor && deputyFor.id !== currentGroupId) {
      reasons.set(candidate.id, m.groups_form_already_deputy({ name: deputyFor.name }))
    }
  }

  return { disabledIds: [...reasons.keys()], disabledReason: (id: number) => reasons.get(id) }
}
