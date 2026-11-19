// Demo mode (docs/development/specs/demo-mode.md): whether it's on, whether a congregation is a visitor's copy, and how
// long a copy lives.

const MINUTE = 60 * 1000
const IDLE_LIFETIME = 60 * MINUTE
const MAX_LIFETIME = 24 * 60 * MINUTE

/** Off unless the installation says so: the hosted service turns it on, a self-hosted instance has no use for it. */
export function isDemoModeEnabled(): boolean {
  return process.env.UNITAE_DEMO === 'true'
}

/** A visitor's demo copy: the guards, the banner and the role switch apply to it. */
export function isDemoCongregation(congregation: { demoExpiresAt: Date | null }): boolean {
  return isDemoModeEnabled() && congregation.demoExpiresAt != null
}

/**
 * The copy's next expiry after a request: an hour from now, never past 24 hours after it was ready. `null` when there's
 * nothing to write: the last push is under a minute old, or the copy has already expired (the control plane deletes it).
 */
export function nextDemoExpiry({
  now,
  readyAt,
  expiresAt,
}: {
  now: Date
  readyAt: Date
  expiresAt: Date
}): Date | null {
  if (expiresAt <= now) return null
  const next = new Date(Math.min(now.getTime() + IDLE_LIFETIME, readyAt.getTime() + MAX_LIFETIME))
  return next.getTime() - expiresAt.getTime() >= MINUTE ? next : null
}
