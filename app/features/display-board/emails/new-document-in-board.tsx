import * as m from '~/i18n/paraglide/messages'
import { EmailButton, EmailLayout, EmailText } from '~/shared/emails/EmailLayout'

export default function NewDocumentInBoard({
  email = 'test@email.com',
  firstname = 'Jean',
  filename = 'Reunions publiques',
  documentId = 158,
  baseUrl = 'https://unitae.example.com',
  platformName = 'Unitae',
}: {
  email: string
  firstname?: string
  filename?: string
  documentId?: number
  baseUrl?: string
  platformName?: string
}) {
  return (
    <EmailLayout
      preview={m.email_new_document_preview()}
      heading={m.email_new_document_heading()}
      footer={m.email_new_document_footer({ email })}
      platformName={platformName}
    >
      <EmailText>{m.email_new_document_greeting({ name: firstname ?? email })}</EmailText>
      <EmailText>{m.email_new_document_body_1({ filename: filename ?? '' })}</EmailText>
      <EmailText>{m.email_new_document_body_2()}</EmailText>
      <EmailText>{m.email_new_document_body_3()} </EmailText>
      <EmailButton href={`${baseUrl}/board/documents/${documentId}/edit`}>{m.email_new_document_button()}</EmailButton>
      <EmailText>{m.email_new_document_regards()}</EmailText>
      <EmailText>{m.email_new_document_team({ platformName })}</EmailText>
    </EmailLayout>
  )
}
