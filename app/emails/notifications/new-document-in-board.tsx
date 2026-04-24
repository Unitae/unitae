import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from 'react-email'
import * as m from '~/paraglide/messages'

export default function NewDocumentInBoard({
  email = 'test@email.com',
  firstname = 'Jean',
  filename = 'Reunions publiques',
  documentId = 158,
  baseUrl = 'https://unitae.app',
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
    <Html>
      <Head />
      <Preview>{m.email_new_document_preview()}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              <strong>{m.email_new_document_heading_line1()}</strong>
              <br /> {m.email_new_document_heading_line2()}
            </Heading>
            <Section>
              <Text>{m.email_new_document_greeting({ name: firstname ?? email })}</Text>
              <Text>{m.email_new_document_body_1({ filename: filename ?? '' })}</Text>
              <Text>{m.email_new_document_body_2()}</Text>
              <Text>{m.email_new_document_body_3()} </Text>
              <Text className="text-center">
                <Link
                  href={`${baseUrl}/board/documents/${documentId}/edit`}
                  className="inline-block rounded-md bg-teal-600 px-3 py-2 text-white"
                >
                  {m.email_new_document_button()}
                </Link>
              </Text>
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
