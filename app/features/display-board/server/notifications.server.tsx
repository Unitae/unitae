import type { BoardDocument } from '~/database/generated/client'
import NewDocumentInBoard from '~/features/notifications/emails/new-document-in-board'
import * as m from '~/i18n/paraglide/messages'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { mailer } from '~/shared/infra/mailer.server'
import { Permission } from '~/shared/types/permission'

export async function sendNewDocumentNotificationEmail(
  congregation: CongregationInfo,
  { document }: { document: BoardDocument },
) {
  const users = await unscopedDb.user.findMany({
    where: {
      congregationId: congregation.id,
      congregationPermissions: {
        some: {
          permission: { key: Permission.BoardValidator },
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
