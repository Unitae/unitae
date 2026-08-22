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
 * It also makes adopting presets safe by construction — until roles are set on
 * a kind, every part keeps exactly the eligibility it had.
 */
export function resolveAllowedRoleIds(partRoleIds: number[], presetRoleIds: number[]): number[] {
  return presetRoleIds.length > 0 ? presetRoleIds : partRoleIds
}
