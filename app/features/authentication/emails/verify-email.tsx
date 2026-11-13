import * as m from '~/i18n/paraglide/messages'
import { EmailLayout, EmailLink, EmailText } from '~/shared/emails/EmailLayout'

export default function VerifyEmail({
  email = 'test@email.com',
  token = 'e5e560cea5052445767419081f902c1b',
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
  const verifyLink = `${baseUrl}/verify-email/${token}`

  return (
    <EmailLayout
      preview={m.email_verify_preview()}
      heading={m.email_verify_heading()}
      footer={m.email_verify_footer({ email })}
      platformName={platformName}
    >
      <EmailText>{m.email_verify_greeting({ name: firstname ?? email })}</EmailText>
      <EmailText>
        {m.email_verify_body()}{' '}
        <EmailLink href={verifyLink} wrap>
          {verifyLink}
        </EmailLink>
      </EmailText>
      <EmailText>{m.email_verify_regards()}</EmailText>
      <EmailText>{m.email_verify_signature({ platformName: platformName ?? 'Unitae' })}</EmailText>
    </EmailLayout>
  )
}
