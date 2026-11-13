import * as m from '~/i18n/paraglide/messages'
import { EmailButton, EmailLayout, EmailText } from '~/shared/emails/EmailLayout'
import type { ProgrammeRole } from '../model/template-role'

function roleLabel(role: ProgrammeRole): string {
  if (role === 'speaker') return m.email_programme_role_speaker()
  if (role === 'reader') return m.email_programme_role_reader()
  return m.email_programme_role_servant()
}

export default function ProgrammeAssignmentUnassigned({
  email = 'test@email.com',
  firstname = 'Jean',
  eventName = 'Réunion de milieu de semaine',
  eventDate = 'lundi 20 juillet 2026',
  assignmentName = 'Perles de la Parole',
  role = 'speaker',
  link = '/board',
  baseUrl = 'https://unitae.example.com',
  platformName = 'Unitae',
}: {
  email: string
  firstname?: string
  eventName: string
  eventDate: string
  assignmentName: string
  role: ProgrammeRole
  link: string
  baseUrl?: string
  platformName?: string
}) {
  return (
    <EmailLayout
      preview={m.email_programme_unassigned_preview()}
      heading={m.email_programme_unassigned_heading()}
      footer={m.email_programme_unassigned_footer({ email })}
      platformName={platformName}
    >
      <EmailText>{m.email_programme_unassigned_greeting({ name: firstname ?? email })}</EmailText>
      <EmailText>
        {m.email_programme_unassigned_body_1({
          role: roleLabel(role),
          assignmentName,
          eventName,
          eventDate,
        })}
      </EmailText>
      <EmailText>{m.email_programme_unassigned_body_2()}</EmailText>
      <EmailButton href={`${baseUrl}${link}`}>{m.email_programme_unassigned_button()}</EmailButton>
      <EmailText>{m.email_programme_unassigned_regards()}</EmailText>
      <EmailText>{m.email_programme_unassigned_team({ platformName })}</EmailText>
    </EmailLayout>
  )
}
