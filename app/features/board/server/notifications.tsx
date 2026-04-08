import NewDocumentInBoard from 'emails/notifications/new-document-in-board'
import type { BoardDocument } from '~/database/generated/client'
import { Role } from '~/features/authorization/model/roles.type'
import { requireCongregation } from '~/shared/libs/congregation.server'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { mailer } from '~/shared/libs/mailer.server'

export async function sendNewDocumentNotificationEmail({ document }: { document: BoardDocument }) {
  const users = await db.user.findMany({
    where: {
      congregationRoles: {
        some: {
          role: { key: Role.BoardValidator },
        },
      },
    },
  })

  const congregation = requireCongregation()

  for (const user of users) {
    try {
      await mailer.emails.send({
        to: user.email,
        from: congregation.emailFrom,
        subject: "Nouveau document sur le tableau d'affichage",
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
