// The roles a visitor can try the demo as. Client-safe: the banner lists them.

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

/**
 * « Créer votre assemblée » from a copy: the hosted site's registration, told the visitor comes from the demo and as
 * which role, so its funnel counts the congregations the demo brought. A link that isn't absolute is left as it is.
 */
export function registerLinkFromDemo(registerUrl: string, role: DemoRole | null): string {
  let url: URL
  try {
    url = new URL(registerUrl)
  } catch {
    return registerUrl
  }
  url.searchParams.set('from', 'demo')
  if (role) url.searchParams.set('role', role)
  return url.toString()
}
