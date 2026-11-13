import * as m from '~/i18n/paraglide/messages'
import { EmailButton, EmailLayout, EmailText } from '~/shared/emails/EmailLayout'

export default function BuildingSyncDone({
  email = 'test@email.com',
  firstname = 'Jean',
  baseUrl = 'https://unitae.example.com',
  platformName = 'Unitae',
  created,
  missing,
}: {
  email: string
  firstname?: string
  baseUrl?: string
  platformName?: string
  /** Counts from the run; absent on notifications queued before runs were recorded. */
  created?: number
  missing?: number
}) {
  return (
    <EmailLayout
      preview={m.email_sync_done_preview()}
      heading={m.email_sync_done_heading()}
      footer={m.email_sync_done_footer({ email })}
      platformName={platformName}
    >
      <EmailText>{m.email_sync_done_greeting({ name: firstname ?? email })}</EmailText>
      <EmailText>{m.email_sync_done_body_1()}</EmailText>
      <EmailText>
        <strong>
          {created != null && missing != null
            ? m.email_sync_done_counts({ created, missing })
            : m.email_sync_done_body_2()}
        </strong>
      </EmailText>
      <EmailText>{m.email_sync_done_body_3()} </EmailText>
      <EmailButton href={`${baseUrl}/territories/buildings/`}>{m.email_sync_done_button()}</EmailButton>
      <EmailText>{m.email_sync_done_regards()}</EmailText>
      <EmailText>{m.email_sync_done_team({ platformName })}</EmailText>
    </EmailLayout>
  )
}
