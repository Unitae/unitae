import BuildingSyncDone from '~/features/territories/emails/buildings-sync-done'
import * as m from '~/paraglide/messages'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import logger from '~/shared/infra/logger.server'
import { mailer } from '~/shared/infra/mailer.server'

export async function sendMailAfterDataSync(email: string, username?: string, congregation?: CongregationInfo) {
  try {
    await mailer.emails.send({
      to: email,
      from: congregation?.emailFrom ?? 'Unitae <noreply@unitae.app>',
      subject: m.email_territory_sync_subject(),
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
