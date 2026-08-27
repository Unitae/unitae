import { z } from 'zod'
import { defineNotificationType, manifest } from '~/features/notifications'
import * as m from '~/i18n/paraglide/messages'
import { Permission } from '~/shared/types/permission'
import BoardDocumentDeleted from '../emails/board-document-deleted'
import BoardDocumentUpdated from '../emails/board-document-updated'
import DocumentsExpiring from '../emails/documents-expiring'
import NewDocumentInBoard from '../emails/new-document-in-board'

const BOARD_CATEGORY = { key: 'board', label: () => m.notification_category_board() }

// Non-manager uploads a document → validators are alerted after a 10-min debounce.
const boardDocumentCreated = defineNotificationType({
  type: 'board.document.created',
  category: BOARD_CATEGORY,
  label: () => m.notification_board_document_created(),
  routing: {
    debounceMinutes: 10,
    recipientStrategy: 'role',
    recipientRole: Permission.CanReviewBoardDocuments,
  },
  payload: z.object({
    title: z.string(),
    documentId: z.number().int().positive(),
  }),
  subject: () => m.email_board_new_document_subject(),
  renderEmail: ({ payload, recipient, congregation }) => (
    <NewDocumentInBoard
      email={recipient.email}
      firstname={recipient.firstname ?? undefined}
      filename={payload.title}
      documentId={payload.documentId}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />
  ),
  example: { title: 'Sample doc', documentId: 42 },
})

// Non-manager edits a document → validators re-notified after a 10-min debounce.
const boardDocumentUpdated = defineNotificationType({
  type: 'board.document.updated',
  category: BOARD_CATEGORY,
  label: () => m.notification_board_document_updated(),
  routing: {
    debounceMinutes: 10,
    recipientStrategy: 'role',
    recipientRole: Permission.CanReviewBoardDocuments,
  },
  payload: z.object({
    title: z.string(),
    documentId: z.number().int().positive(),
  }),
  subject: () => m.email_board_updated_document_subject(),
  renderEmail: ({ payload, recipient, congregation }) => (
    <BoardDocumentUpdated
      email={recipient.email}
      firstname={recipient.firstname ?? undefined}
      filename={payload.title}
      documentId={payload.documentId}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />
  ),
  example: { title: 'Sample doc', documentId: 42 },
})

// Deletion cancels a pending created/updated event; if none pending, sends
// instant fallback so validators know a doc they've already seen is gone.
const boardDocumentDeleted = defineNotificationType({
  type: 'board.document.deleted',
  category: BOARD_CATEGORY,
  label: () => m.notification_board_document_deleted(),
  routing: {
    cancels: ['board.document.created', 'board.document.updated'],
    fallback: {
      debounceMinutes: 0,
      recipientStrategy: 'role',
      recipientRole: Permission.CanReviewBoardDocuments,
    },
  },
  payload: z.object({
    title: z.string().min(1),
  }),
  subject: () => m.email_board_deleted_document_subject(),
  renderEmail: ({ payload, recipient, congregation }) => (
    <BoardDocumentDeleted
      email={recipient.email}
      firstname={recipient.firstname ?? undefined}
      filename={payload.title}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />
  ),
  example: { title: 'Sample doc' },
})

// Cron: documents nearing their visibility end date. Batched per congregation
// into a single email with the full list — one instant notify() per congregation.
const boardDocumentExpiring = defineNotificationType({
  type: 'board.document.expiring',
  category: BOARD_CATEGORY,
  label: () => m.notification_board_document_expiring(),
  routing: {
    debounceMinutes: 0,
    recipientStrategy: 'role',
    recipientRole: Permission.CanReviewBoardDocuments,
  },
  payload: z.object({
    documents: z.array(z.object({ id: z.number().int().positive(), title: z.string() })).min(1),
  }),
  subject: payload => m.email_board_expiration_subject({ count: payload.documents.length }),
  renderEmail: ({ payload, recipient, congregation }) => (
    <DocumentsExpiring
      email={recipient.email}
      firstname={recipient.firstname ?? undefined}
      documents={payload.documents}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />
  ),
  example: { documents: [{ id: 1, title: 'Sample doc' }] },
})

// `manifest()` erases the heterogeneous payload generics so downstream code
// (registry, contract test) can iterate without narrowing to a union. Each
// definition still preserves its own T internally.
export const boardNotifications = manifest(
  boardDocumentCreated,
  boardDocumentUpdated,
  boardDocumentDeleted,
  boardDocumentExpiring,
)
