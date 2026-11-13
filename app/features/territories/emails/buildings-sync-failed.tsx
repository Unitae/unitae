import * as m from '~/i18n/paraglide/messages'
import { EmailButton, EmailLayout, EmailText } from '~/shared/emails/EmailLayout'
import { buildingSyncErrorLabel } from '../model/building-sync-error-label'

export default function BuildingSyncFailed({
  email = 'test@email.com',
  firstname = 'Jean',
  baseUrl = 'https://unitae.example.com',
  platformName = 'Unitae',
  reason,
}: {
  email: string
  firstname?: string
  baseUrl?: string
  platformName?: string
  reason?: string
}) {
  return (
    <EmailLayout
      preview={m.email_sync_failed_preview()}
      heading={m.email_sync_failed_heading()}
      footer={m.email_sync_done_footer({ email })}
      platformName={platformName}
    >
      <EmailText>{m.email_sync_done_greeting({ name: firstname ?? email })}</EmailText>
      <EmailText>{m.email_sync_failed_body()}</EmailText>
      <EmailText>
        <strong>{buildingSyncErrorLabel(reason)}</strong>
      </EmailText>
      <EmailText>{m.email_sync_failed_kept()}</EmailText>
      <EmailButton href={`${baseUrl}/territories/buildings/`}>{m.email_sync_failed_button()}</EmailButton>
      <EmailText>{m.email_sync_done_regards()}</EmailText>
      <EmailText>{m.email_sync_done_team({ platformName })}</EmailText>
    </EmailLayout>
  )
}
