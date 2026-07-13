import type { ReactNode } from 'react'
import type { z } from 'zod'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import type { NotificationTypeConfig } from './notification-event.type'

// Shape passed to a definition's subject() and renderEmail() callbacks.
// The recipient's firstname is pre-resolved by displayFirstname (Member wins
// over UserAccount) inside the notifications pipeline — consumers just render.
export interface NotificationRecipient {
  email: string
  firstname: string | null
}

export interface NotificationRenderContext<T> {
  payload: T
  recipient: NotificationRecipient
  congregation: CongregationInfo
}

// A feature-owned declaration of one notification type. Consumer features
// build these with defineNotificationType() and expose them through their
// index.server.ts barrel; the notifications feature's registry aggregates
// them. See docs/development/notifications.md.
export interface NotificationTypeDefinition<T = unknown> {
  // Dot-notation: '{category}.{entity}.{action}'. First segment is the
  // category used for wildcard preferences.
  type: string

  // Which category this type belongs to in the preferences UI. Definitions
  // that share a category `key` get grouped under the same card. `label`
  // is a Paraglide message accessor called at render time.
  category: { key: string; label: () => string }

  // Preferences-UI toggle label.
  label: () => string

  // Debounce/cancellation/recipient routing config; the dispatcher reads this.
  routing: NotificationTypeConfig

  // Zod schema validated by the renderer before subject()/renderEmail() run.
  // The generic T flows from here into subject, renderEmail, and example.
  payload: z.ZodType<T>

  // Subject line for the outgoing email. Called with the parsed payload.
  subject: (payload: T) => string

  // React Email element for the outgoing message. Returning null skips delivery.
  renderEmail: (ctx: NotificationRenderContext<T>) => ReactNode

  // A payload example that MUST satisfy `payload.safeParse`. The renderer
  // contract test uses this to prove each definition ships a working render.
  // Colocating the example with the schema/renderer avoids fixture drift.
  example: T

  // Optional: when true, the preferences toggle appears but is disabled —
  // users can't opt out of critical notifications (e.g. account security).
  critical?: boolean
}

// Schema-first factory that infers T directly from the Zod schema's inferred
// output type. Closes the `z.ZodType<T>` variance hole (`z.ZodType<T>` is loose
// about how T relates to the schema's actual output) by taking the schema
// itself as the source of truth and flowing `z.infer<S>` into every T slot on
// the definition. Runtime is an identity function; the value is entirely in
// the typing.
export function defineNotificationType<S extends z.ZodTypeAny>(
  def: Omit<NotificationTypeDefinition<z.infer<S>>, 'payload'> & { payload: S },
): NotificationTypeDefinition<z.infer<S>> {
  return def
}

// Erases the T at the array boundary so heterogeneous definitions can live
// in one exported list without an `as NotificationTypeDefinition<unknown>[]`
// cast at every export. Each definition still preserves its own T internally
// through defineNotificationType; the erasure is only at the aggregation point.
//
// Parameter is `NotificationTypeDefinition<any>` (scoped `any`, not returned)
// because `subject`/`renderEmail` are contravariant in T — a heterogeneous
// tuple of definitions with different Ts cannot be assigned to
// `NotificationTypeDefinition<unknown>[]` at the call site, only at return.
// biome-ignore lint/suspicious/noExplicitAny: contravariance escape hatch scoped to this parameter
export function manifest(...defs: NotificationTypeDefinition<any>[]): NotificationTypeDefinition<unknown>[] {
  return defs as NotificationTypeDefinition<unknown>[]
}
