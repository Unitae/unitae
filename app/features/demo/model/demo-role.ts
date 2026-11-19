// The roles a visitor can try the demo as (docs/development/specs/demo-mode.md). Client-safe: the banner lists them.

export const DEMO_ROLES = [
  'coordinator',
  'secretary',
  'programmes',
  'territories',
  'group-overseer',
  'publisher',
] as const

export type DemoRole = (typeof DEMO_ROLES)[number]

export function isDemoRole(value: unknown): value is DemoRole {
  return typeof value === 'string' && (DEMO_ROLES as readonly string[]).includes(value)
}

/** The `Setting` that maps each role to the login a copy signs in as: `{ "secretary": 412, … }`. */
export const DEMO_ACCOUNTS_SETTING = 'demoAccounts'
