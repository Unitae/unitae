/**
 * Which roles may be assigned to a slot: the preset's when it has any,
 * otherwise the part's own.
 *
 * This is deliberately NOT the rule used for allowExternalSpeaker, where the
 * preset wins even when it says no. The difference is what "empty" means.
 * resolveEligibleUserIds reads an empty allowed-roles list as "any member" —
 * the widest setting, not the narrowest. So an unconfigured preset is
 * indistinguishable from one that permits everyone, and letting it win would
 * silently hand every part using that kind the largest possible audience.
 *
 * The consequence, worth knowing: a preset can narrow eligibility or redefine
 * it, but cannot be used to lift a restriction a part already carries. Removing
 * one means clearing it on the part.
 *
 * It also makes adopting a kind safe on the read side — until roles are set on
 * it, every part resolves to exactly the eligibility it had. Keeping that true
 * on the write side is a separate problem, and the reason the part editor stops
 * managing these rows once a kind is chosen: see partAllowedRolesToWrite.
 *
 * Named rather than positional because the two lists are the same type and the
 * whole rule is which one wins; swapping them would compile and invert it.
 */
export function resolveAllowedRoleIds({
  partRoleIds,
  presetRoleIds,
}: {
  partRoleIds: number[]
  presetRoleIds: number[]
}): number[] {
  return presetRoleIds.length > 0 ? presetRoleIds : partRoleIds
}

/**
 * Which role slots the part editor actually managed.
 *
 * The editor hides its role pickers once a kind is chosen, and an unchecked
 * checkbox submits nothing — so "the user cleared the selection" and "the
 * picker was never rendered" arrive as the same empty field. The kind is what
 * tells them apart: with one, eligibility belongs to the kind (see
 * resolveAllowedRoleIds) and the part's own rows must be left alone, because
 * they are what the kind falls back to while it restricts nobody.
 *
 * Omitting the keys rather than sending [] is the point — the services treat
 * undefined as "not managed" and [] as "managed, and empty".
 */
export function partAllowedRolesToWrite(value: {
  partPresetId: number | null
  allowedSpeakerRoleIds: number[]
  allowedReaderRoleIds: number[]
}): { allowedSpeakerRoleIds?: number[]; allowedReaderRoleIds?: number[] } {
  if (value.partPresetId != null) return {}
  return {
    allowedSpeakerRoleIds: value.allowedSpeakerRoleIds,
    allowedReaderRoleIds: value.allowedReaderRoleIds,
  }
}
