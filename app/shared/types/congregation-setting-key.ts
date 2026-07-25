export enum CongregationSettingKey {
  AuxiliaryPioneerProfileActivated = 'auxiliary-pioneer-profile-active',
  BreachedPasswordCheckScope = 'breached-password-check-scope',
}

// Scope of the optional HaveIBeenPwned breached-password check. `off` (or unset)
// disables it; `responsibilities` limits it to appointed men and accounts with
// management access; `everyone` applies it to all accounts.
export const BREACHED_PASSWORD_CHECK_SCOPES = ['off', 'responsibilities', 'everyone'] as const
export type BreachedPasswordCheckScope = (typeof BREACHED_PASSWORD_CHECK_SCOPES)[number]
