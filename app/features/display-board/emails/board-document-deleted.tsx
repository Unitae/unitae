import * as m from '~/i18n/paraglide/messages'
import { EmailLayout, EmailText } from '~/shared/emails/EmailLayout'

export default function BoardDocumentDeleted({
  email = 'test@email.com',
  firstname = 'Jean',
  filename = 'Reunions publiques',
  platformName = 'Unitae',
}: {
  email: string
  firstname?: string
  filename: string
  baseUrl?: string
  platformName?: string
}) {
  return (
    <EmailLayout
      preview={m.email_board_deleted_document_preview()}
      heading={m.email_board_deleted_document_heading()}
      footer={m.email_new_document_footer({ email })}
      platformName={platformName}
    >
      <EmailText>{m.email_board_deleted_document_greeting({ name: firstname ?? email })}</EmailText>
      <EmailText>{m.email_board_deleted_document_body({ filename })}</EmailText>
      <EmailText>{m.email_new_document_regards()}</EmailText>
      <EmailText>{m.email_new_document_team({ platformName })}</EmailText>
    </EmailLayout>
  )
}
