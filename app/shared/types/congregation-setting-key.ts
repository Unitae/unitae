export enum CongregationSettingKey {
  AuxiliaryPioneerProfileActivated = 'auxiliary-pioneer-profile-active',
  BreachedPasswordCheckScope = 'breached-password-check-scope',
}

// Scope of the optional HaveIBeenPwned breached-password check. `off` (or unset)
// disables it; `responsibilities` limits it to appointed men and accounts with
// management access; `everyone` applies it to all accounts.
export const BREACHED_PASSWORD_CHECK_SCOPES = ['off', 'responsibilities', 'everyone'] as const
export type BreachedPasswordCheckScope = (typeof BREACHED_PASSWORD_CHECK_SCOPES)[number]

// Narrow a raw Setting value (String column, also writable by the control plane
// / migrations / manual edits) into the typed union. Unknown/legacy values fall
// back to the fail-closed default `off`. Returns whether the raw value was a
// recognized scope so callers can log drift.
export function parseBreachedPasswordCheckScope(value: string | null | undefined): {
  scope: BreachedPasswordCheckScope
  recognized: boolean
} {
  const recognized = value != null && (BREACHED_PASSWORD_CHECK_SCOPES as readonly string[]).includes(value)
  return { scope: recognized ? (value as BreachedPasswordCheckScope) : 'off', recognized }
}
