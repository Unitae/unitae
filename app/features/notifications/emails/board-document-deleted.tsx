import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Tailwind, Text } from 'react-email'
import * as m from '~/i18n/paraglide/messages'

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
    <Html>
      <Head />
      <Preview>{m.email_board_deleted_document_preview()}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              <strong>{m.email_board_deleted_document_heading()}</strong>
            </Heading>
            <Section>
              <Text>{m.email_board_deleted_document_greeting({ name: firstname ?? email })}</Text>
              <Text>{m.email_board_deleted_document_body({ filename })}</Text>
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
