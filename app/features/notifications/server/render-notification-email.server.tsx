import type { ReactNode } from 'react'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import { createLogger } from '~/shared/infra/logger.server'
import { NOTIFICATION_REGISTRY } from './registry.server'

const logger = createLogger('notification-render')

export interface RenderedNotification {
  subject: string
  react: ReactNode | null
}

interface Recipient {
  email: string
  firstname: string | null
}

// Delegates to the definition registered for `notificationType`. Returns
// `{subject: '', react: null}` when the type is unregistered or the payload
// fails the definition's Zod schema — the worker logs and skips delivery.
export function renderNotificationEmail(
  notificationType: string,
  payload: unknown,
  recipient: Recipient,
  congregation: CongregationInfo,
): RenderedNotification {
  const def = NOTIFICATION_REGISTRY.get(notificationType)
  if (!def) {
    logger.warn('Unregistered notification type', { notificationType })
    return { subject: '', react: null }
  }

  const parsed = def.payload.safeParse(payload)
  if (!parsed.success) {
    logger.warn('Invalid payload for notification', { notificationType, error: parsed.error.message })
    return { subject: '', react: null }
  }

  return {
    subject: def.subject(parsed.data),
    react: def.renderEmail({ payload: parsed.data, recipient, congregation }),
  }
}
