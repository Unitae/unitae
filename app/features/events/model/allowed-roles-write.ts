/** The two slots a programme part can put someone in. */
export type PartRoleSlot = 'speaker' | 'reader'

const SLOTS: PartRoleSlot[] = ['speaker', 'reader']

/**
 * The hidden field the part editor uses to declare which role pickers it drew.
 *
 * Exported so the sheet and the schema name it once. They live in different
 * features, and a typo on either side would silently reintroduce the bug this
 * whole mechanism exists to prevent.
 */
export const MANAGED_ROLE_SLOTS_FIELD = 'managedRoleSlots'

/**
 * Which role slots the part editor actually managed.
 *
 * An unchecked picker submits nothing, and so does a picker that was never
 * drawn — both reach the action as an empty field. They must not mean the same
 * thing: one is "the user cleared the selection" and has to delete the stored
 * rows, the other is "this slot was never on screen" and has to leave them
 * alone. The reader picker is hidden whenever the chosen kind has no reader
 * slot, so without this distinction, giving a part such a kind deleted the
 * restriction it already carried and widened the slot to every member.
 *
 * The form declares what it drew rather than the action re-deriving it. The
 * render condition and the write decision would otherwise be two copies of one
 * rule in different features, free to drift apart — which is how this bug
 * arrived the first time.
 *
 * Omitting the keys rather than sending [] is the point: the services treat
 * undefined as "not managed" and [] as "managed, and empty".
 */
export function partAllowedRolesToWrite(value: {
  managedSlots: string[]
  allowedSpeakerRoleIds: number[]
  allowedReaderRoleIds: number[]
}): { allowedSpeakerRoleIds?: number[]; allowedReaderRoleIds?: number[] } {
  // Filtered against the known slots rather than trusted: the list arrives
  // from a form post, so an unrecognised name means "not managed" instead of
  // reaching a lookup that would resolve to undefined.
  const managed = new Set(SLOTS.filter(slot => value.managedSlots.includes(slot)))

  return {
    ...(managed.has('speaker') ? { allowedSpeakerRoleIds: value.allowedSpeakerRoleIds } : {}),
    ...(managed.has('reader') ? { allowedReaderRoleIds: value.allowedReaderRoleIds } : {}),
  }
}
