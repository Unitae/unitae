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

  // Preferences-UI toggle label. Paraglide accessor — TypeScript catches
  // missing i18n keys at authoring time.
  label: () => string

  // Debounce/cancellation/recipient routing config. Same shape as the
  // pre-registry NOTIFICATION_TYPES map — dispatcher reads this.
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

// Identity helper that preserves T through inference. The runtime is
// intentionally trivial — the value comes from the type ergonomics: TypeScript
// infers T from `payload` (Zod) and flows it into subject, renderEmail, example.
export function defineNotificationType<T>(def: NotificationTypeDefinition<T>): NotificationTypeDefinition<T> {
  return def
}
