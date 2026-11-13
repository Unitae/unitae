import * as m from '~/i18n/paraglide/messages'
import { EmailLayout, EmailLink, EmailText } from '~/shared/emails/EmailLayout'

export default function ResetPassword({
  email = 'test@email.com',
  token = 'e5e560cea5052445767419081f902c1b.abc3d54f092d690db954825aa6373ec5a3baa131db338769848e0c7507a061b3',
  firstname = 'Jean',
  baseUrl = 'https://unitae.example.com',
  platformName = 'Unitae',
}: {
  email: string
  firstname?: string
  token: string
  baseUrl?: string
  platformName?: string
}) {
  const resetLink = `${baseUrl}/password/${token}/reset/`

  return (
    <EmailLayout
      preview={m.email_reset_password_preview()}
      heading={m.email_reset_password_heading()}
      footer={m.email_reset_password_footer({ email })}
      platformName={platformName}
    >
      <EmailText>{m.email_reset_password_greeting({ name: firstname ?? email })}</EmailText>
      <EmailText>
        {m.email_reset_password_body()}{' '}
        <EmailLink href={resetLink} wrap>
          {resetLink}
        </EmailLink>
      </EmailText>
      <EmailText>{m.email_reset_password_regards()}</EmailText>
      <EmailText>{m.email_reset_password_signature({ platformName: platformName ?? 'Unitae' })}</EmailText>
    </EmailLayout>
  )
}
