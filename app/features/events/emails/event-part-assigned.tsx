import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Tailwind, Text } from 'react-email'
import * as m from '~/i18n/paraglide/messages'
import type { ProgrammeRole } from '../model/template-role'

function roleLabel(role: ProgrammeRole): string {
  if (role === 'speaker') return m.email_programme_role_speaker()
  if (role === 'reader') return m.email_programme_role_reader()
  return m.email_programme_role_servant()
}

export default function ProgrammeAssignmentAssigned({
  email = 'test@email.com',
  firstname = 'Jean',
  eventName = 'Réunion de milieu de semaine',
  eventDate = 'lundi 20 juillet 2026',
  assignmentName = 'Perles de la Parole',
  role = 'speaker',
  link = '/board',
  baseUrl = 'https://unitae.app',
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
    <Html>
      <Head />
      <Preview>{m.email_programme_assigned_preview()}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              <strong>{m.email_programme_assigned_heading_line1()}</strong>
              <br /> {m.email_programme_assigned_heading_line2()}
            </Heading>
            <Section>
              <Text>{m.email_programme_assigned_greeting({ name: firstname ?? email })}</Text>
              <Text>
                {m.email_programme_assigned_body_1({
                  role: roleLabel(role),
                  assignmentName,
                  eventName,
                  eventDate,
                })}
              </Text>
              <Text>{m.email_programme_assigned_body_2()}</Text>
              <Text className="text-center">
                <Link href={`${baseUrl}${link}`} className="inline-block rounded-md bg-teal-600 px-3 py-2 text-white">
                  {m.email_programme_assigned_button()}
                </Link>
              </Text>
              <Text>{m.email_programme_assigned_regards()}</Text>
              <Text>{m.email_programme_assigned_team({ platformName })}</Text>
            </Section>
            <Hr className="mx-0 my-[26px] w-full border border-[#eaeaea] border-solid" />
            <Text className="text-[#666666] text-[12px] leading-[24px]">
              {m.email_programme_assigned_footer({ email })}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
