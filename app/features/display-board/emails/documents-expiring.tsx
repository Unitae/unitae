import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Tailwind, Text } from 'react-email'
import * as m from '~/i18n/paraglide/messages'

export default function DocumentsExpiring({
  email = 'test@email.com',
  firstname = 'Jean',
  documents = [{ id: 1, title: 'Reunions publiques' }],
  baseUrl = 'https://unitae.app',
  platformName = 'Unitae',
}: {
  email: string
  firstname?: string
  documents: { id: number; title: string }[]
  baseUrl?: string
  platformName?: string
}) {
  return (
    <Html>
      <Head />
      <Preview>{m.email_documents_expiring_preview()}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              <strong>{m.email_documents_expiring_heading()}</strong>
            </Heading>
            <Section>
              <Text>{m.email_documents_expiring_greeting({ name: firstname ?? email })}</Text>
              <Text>{m.email_documents_expiring_body({ count: documents.length })}</Text>
              {documents.map(doc => (
                <Text key={doc.id}>
                  •{' '}
                  <Link href={`${baseUrl}/board/documents/${doc.id}/edit`} className="text-teal-600">
                    {doc.title}
                  </Link>
                </Text>
              ))}
              <Text>{m.email_documents_expiring_action()}</Text>
              <Text>{m.email_new_document_regards()}</Text>
              <Text>{m.email_new_document_team({ platformName })}</Text>
            </Section>
            <Hr className="mx-0 my-[26px] w-full border border-[#eaeaea] border-solid" />
            <Text className="text-[#666666] text-[12px] leading-[24px]">{m.email_new_document_footer({ email })}</Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
