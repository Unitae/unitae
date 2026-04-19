import NewDocumentInBoard from 'emails/notifications/new-document-in-board'
import type { BoardDocument } from '~/database/generated/client'
import { Role } from '~/shared/types/role'
import * as m from '~/paraglide/messages'
import type { CongregationInfo } from '~/shared/libs/congregation.server'
import { unscopedDb } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { mailer } from '~/shared/libs/mailer.server'

export async function sendNewDocumentNotificationEmail(
  congregation: CongregationInfo,
  { document }: { document: BoardDocument },
) {
  const users = await unscopedDb.user.findMany({
    where: {
      congregationId: congregation.id,
      congregationRoles: {
        some: {
          role: { key: Role.BoardValidator },
        },
      },
    },
  })

  for (const user of users) {
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
}
