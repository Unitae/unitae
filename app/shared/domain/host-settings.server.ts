import logger from '~/shared/infra/logger.server'

/**
 * What changes from one instance to another, read from the HOST_SETTINGS JSON. Everything is optional: an instance
 * that sets nothing shows no link to anywhere else and describes itself as run by whoever deployed it.
 */
export interface HostSettings {
  /** Subscription links (managed hosting). Both or neither. */
  billing?: {
    portalUrl: string
    upgradeUrl: string
  }
  support?: {
    url: string
  }
  branding?: {
    /** The instance's name where the app names where it lives, e.g. « Aller sur Assemblées du Rhône ». */
    platformName?: string
    /** The instance's own site: where a visitor who reached no congregation is offered to go. */
    homeUrl?: string
  }
  /** Who runs the instance, for the privacy page. */
  operator?: {
    name?: string
    /** The address data-protection requests go to. */
    privacyContact?: string
    /** The operator's own privacy policy, which complements Unitae's. */
    privacyPolicyUrl?: string
    /** Only the managed hosting sets it: its processor, subprocessors, billing and transfers then show. */
    managedHosting?: boolean
  }
}

type Check = (value: unknown) => boolean

const isText: Check = value => typeof value === 'string' && value.trim() !== ''
const isWebAddress: Check = value => {
  if (typeof value !== 'string') return false
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isEmail: Check = value => typeof value === 'string' && EMAIL_RE.test(value)
const isTrue: Check = value => value === true

const SECTIONS = {
  billing: { fields: { portalUrl: isWebAddress, upgradeUrl: isWebAddress }, allOrNothing: true },
  support: { fields: { url: isWebAddress }, allOrNothing: true },
  branding: { fields: { platformName: isText, homeUrl: isWebAddress }, allOrNothing: false },
  operator: {
    fields: { name: isText, privacyContact: isEmail, privacyPolicyUrl: isWebAddress, managedHosting: isTrue },
    allOrNothing: false,
  },
} satisfies Record<keyof HostSettings, { fields: Record<string, Check>; allOrNothing: boolean }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// One section's fields that are what they claim to be; null when nothing usable is left, or when a section whose
// fields only work together (both billing links) is missing one.
function parseSection(
  name: string,
  section: unknown,
  { fields, allOrNothing }: { fields: Record<string, Check>; allOrNothing: boolean },
  problems: string[],
): Record<string, unknown> | null {
  if (!isRecord(section)) {
    problems.push(`HOST_SETTINGS.${name} is not an object`)
    return null
  }
  const kept: Record<string, unknown> = {}
  for (const [field, check] of Object.entries(fields)) {
    if (section[field] === undefined) continue
    if (check(section[field])) kept[field] = section[field]
    else problems.push(`HOST_SETTINGS.${name}.${field} has an unusable value`)
  }
  const found = Object.keys(kept).length
  if (found === 0) return null
  if (allOrNothing && found < Object.keys(fields).length) {
    problems.push(`HOST_SETTINGS.${name} is incomplete`)
    return null
  }
  return kept
}

/**
 * Keeps each field that is what it claims to be and drops the rest, so that a typo hides one link rather than the
 * whole configuration.
 */
function parseHostSettings(raw: unknown, problems: string[]): HostSettings {
  if (!isRecord(raw)) {
    problems.push('HOST_SETTINGS is not a JSON object')
    return {}
  }
  const settings: Record<string, Record<string, unknown>> = {}
  for (const [name, spec] of Object.entries(SECTIONS)) {
    if (raw[name] === undefined) continue
    const section = parseSection(name, raw[name], spec, problems)
    if (section) settings[name] = section
  }
  return settings as HostSettings
}

let cachedSettings: HostSettings | null = null

/** The instance's settings, parsed once. What had to be dropped is reported then, which boot makes happen at start. */
export function getHostSettings(): HostSettings {
  if (cachedSettings) return cachedSettings

  const raw = process.env.HOST_SETTINGS
  if (!raw) {
    cachedSettings = {}
    return cachedSettings
  }

  const problems: string[] = []
  try {
    cachedSettings = parseHostSettings(JSON.parse(raw), problems)
  } catch {
    problems.push('HOST_SETTINGS is not valid JSON')
    cachedSettings = {}
  }
  if (problems.length > 0)
    logger.warn(`${problems.join('; ')} — ignored. See docs/self-hosting/environment-variables.md.`)

  return cachedSettings
}
