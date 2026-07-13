import type { ReactNode } from 'react'
import BoardDocumentDeleted from '~/features/notifications/emails/board-document-deleted'
import BoardDocumentUpdated from '~/features/notifications/emails/board-document-updated'
import DocumentsExpiring from '~/features/notifications/emails/documents-expiring'
import NewDocumentInBoard from '~/features/notifications/emails/new-document-in-board'
import { BuildingSyncDoneEmail as BuildingSyncDone } from '~/features/territories'
import * as m from '~/i18n/paraglide/messages'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import { createLogger } from '~/shared/infra/logger.server'
import {
  boardDocumentCreatedPayloadSchema,
  boardDocumentDeletedPayloadSchema,
  boardDocumentExpiringPayloadSchema,
  boardDocumentUpdatedPayloadSchema,
} from '../schemas/notification-payload.schema'

const logger = createLogger('notification-render')

export interface RenderedNotification {
  subject: string
  react: ReactNode | null
}

interface Recipient {
  email: string
  firstname: string | null
}

// Maps a notification type to (subject, React email element) for a valid payload.
// A returned react: null means "no template" — the worker logs and skips delivery.
// Every entry in NOTIFICATION_TYPES must have a matching case, enforced by
// notification-renderer-contract.test.ts.
export function renderNotificationEmail(
  notificationType: string,
  payload: unknown,
  recipient: Recipient,
  congregation: CongregationInfo,
): RenderedNotification {
  switch (notificationType) {
    case 'board.document.created': {
      const parsed = boardDocumentCreatedPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        logger.warn('Invalid payload for board.document.created', { payload, error: parsed.error.message })
        return { subject: '', react: null }
      }
      return {
        subject: m.email_board_new_document_subject(),
        react: (
          <NewDocumentInBoard
            email={recipient.email}
            firstname={recipient.firstname ?? undefined}
            filename={parsed.data.title}
            documentId={parsed.data.documentId}
            baseUrl={congregation.baseUrl}
            platformName={congregation.displayName}
          />
        ),
      }
    }
    case 'board.document.updated': {
      const parsed = boardDocumentUpdatedPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        logger.warn('Invalid payload for board.document.updated', { payload, error: parsed.error.message })
        return { subject: '', react: null }
      }
      return {
        subject: m.email_board_updated_document_subject(),
        react: (
          <BoardDocumentUpdated
            email={recipient.email}
            firstname={recipient.firstname ?? undefined}
            filename={parsed.data.title}
            documentId={parsed.data.documentId}
            baseUrl={congregation.baseUrl}
            platformName={congregation.displayName}
          />
        ),
      }
    }
    case 'board.document.deleted': {
      const parsed = boardDocumentDeletedPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        logger.warn('Invalid payload for board.document.deleted', { payload, error: parsed.error.message })
        return { subject: '', react: null }
      }
      return {
        subject: m.email_board_deleted_document_subject(),
        react: (
          <BoardDocumentDeleted
            email={recipient.email}
            firstname={recipient.firstname ?? undefined}
            filename={parsed.data.title}
            baseUrl={congregation.baseUrl}
            platformName={congregation.displayName}
          />
        ),
      }
    }
    case 'board.document.expiring': {
      const parsed = boardDocumentExpiringPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        logger.warn('Invalid payload for board.document.expiring', { payload, error: parsed.error.message })
        return { subject: '', react: null }
      }
      return {
        subject: m.email_board_expiration_subject({ count: parsed.data.documents.length }),
        react: (
          <DocumentsExpiring
            email={recipient.email}
            firstname={recipient.firstname ?? undefined}
            documents={parsed.data.documents}
            baseUrl={congregation.baseUrl}
            platformName={congregation.displayName}
          />
        ),
      }
    }
    case 'territory.sync.completed':
      return {
        subject: m.email_territory_sync_subject(),
        react: (
          <BuildingSyncDone
            email={recipient.email}
            firstname={recipient.firstname ?? undefined}
            baseUrl={congregation.baseUrl}
            platformName={congregation.displayName}
          />
        ),
      }
    default:
      return { subject: '', react: null }
  }
}
