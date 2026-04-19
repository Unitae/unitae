import type { Job } from 'bullmq'
import DocumentsExpiring from 'emails/notifications/documents-expiring'
import NewDocumentInBoard from 'emails/notifications/new-document-in-board'
import { Role } from '~/shared/types/role'
import * as m from '~/paraglide/messages'
import { resolveCongregation } from '~/shared/libs/congregation.server'
import { unscopedDb } from '~/shared/libs/db.server'
import { createLogger } from '~/shared/libs/logger.server'
import { mailer } from '~/shared/libs/mailer.server'
import { runWithLocale } from '~/shared/libs/worker-locale.server'
import type { EmailJobData } from './email-queue.server'

const logger = createLogger('email-worker')

export async function handleEmailWork(job: Job<EmailJobData>): Promise<void> {
  switch (job.data.type) {
    case 'new-document-notification':
      return handleNewDocumentNotification(job.data)
    case 'documents-expiring':
      return handleDocumentsExpiring(job.data)
  }
}

async function handleNewDocumentNotification(data: Extract<EmailJobData, { type: 'new-document-notification' }>) {
  const congregation = await resolveCongregation(data.congregationId)

  const document = await unscopedDb.boardDocument.findFirst({
    where: { id: data.documentId, congregationId: data.congregationId },
  })

  if (!document) {
    logger.warn('Document not found for notification, skipping', { documentId: data.documentId })
    return
  }

  const validators = await unscopedDb.user.findMany({
    where: {
      congregationId: data.congregationId,
      active: true,
      congregationRoles: {
        some: { role: { key: Role.BoardValidator } },
      },
    },
  })

  await runWithLocale(congregation.locale, async () => {
    for (const user of validators) {
      try {
        await mailer.emails.send({
          to: user.email,
          from: congregation.emailFrom,
          subject: m.email_board_new_document_subject(),
          react: (
            <NewDocumentInBoard
              email={user.email}
              firstname={user.firstname ?? undefined}
              filename={document.title}
              documentId={document.id}
              baseUrl={congregation.baseUrl}
              platformName={congregation.displayName}
            />
          ),
        })
      } catch (error) {
        logger.error('Failed to send board notification email', { userId: user.id, documentId: document.id, error })
      }
    }
  })
}

async function handleDocumentsExpiring(data: Extract<EmailJobData, { type: 'documents-expiring' }>) {
  await runWithLocale('fr', async () => {
    try {
      await mailer.emails.send({
        to: data.validatorEmail,
        from: data.emailFrom,
        subject: m.email_board_expiration_subject({ count: data.documents.length }),
        react: (
          <DocumentsExpiring
            email={data.validatorEmail}
            firstname={data.validatorFirstname}
            documents={data.documents}
            baseUrl={data.baseUrl}
            platformName={data.displayName}
          />
        ),
      })
    } catch (error) {
      logger.error('Failed to send expiration notification email', {
        email: data.validatorEmail,
        congregationId: data.congregationId,
        error,
      })
    }
  })
}
