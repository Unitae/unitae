import BuildingSyncDone from 'emails/notifications/buildings-sync-done'
import type { CongregationInfo } from '~/shared/libs/congregation.server'
import logger from '~/shared/libs/logger.server'
import { mailer } from '~/shared/libs/mailer.server'

export async function sendMailAfterDataSync(email: string, username?: string, congregation?: CongregationInfo) {
  try {
    await mailer.emails.send({
      to: email,
      from: congregation?.emailFrom ?? 'Unitae <noreply@unitae.app>',
      subject: 'Mise à jour des données du territoires',
      react: (
        <BuildingSyncDone
          email={email}
          firstname={username}
          baseUrl={congregation?.baseUrl}
          platformName={congregation?.displayName}
        />
      ),
    })
  } catch (error) {
    logger.error('Failed to send data sync notification email', { email, error })
  }
}
