import * as m from '~/i18n/paraglide/messages'
import { EmailLayout, EmailLink, EmailText } from '~/shared/emails/EmailLayout'

export default function DocumentsExpiring({
  email = 'test@email.com',
  firstname = 'Jean',
  documents = [{ id: 1, title: 'Reunions publiques' }],
  baseUrl = 'https://unitae.example.com',
  platformName = 'Unitae',
}: {
  email: string
  firstname?: string
  documents: { id: number; title: string }[]
  baseUrl?: string
  platformName?: string
}) {
  return (
    <EmailLayout
      preview={m.email_documents_expiring_preview()}
      heading={m.email_documents_expiring_heading()}
      footer={m.email_new_document_footer({ email })}
      platformName={platformName}
    >
      <EmailText>{m.email_documents_expiring_greeting({ name: firstname ?? email })}</EmailText>
      <EmailText>{m.email_documents_expiring_body({ count: documents.length })}</EmailText>
      {documents.map(doc => (
        <EmailText key={doc.id}>
          • <EmailLink href={`${baseUrl}/board/documents/${doc.id}/edit`}>{doc.title}</EmailLink>
        </EmailText>
      ))}
      <EmailText>{m.email_documents_expiring_action()}</EmailText>
      <EmailText>{m.email_new_document_regards()}</EmailText>
      <EmailText>{m.email_new_document_team({ platformName })}</EmailText>
    </EmailLayout>
  )
}
