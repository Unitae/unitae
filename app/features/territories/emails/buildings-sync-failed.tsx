import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Tailwind, Text } from 'react-email'
import * as m from '~/i18n/paraglide/messages'
import { buildingSyncErrorLabel } from '../model/building-sync-error-label'

export default function BuildingSyncFailed({
  email = 'test@email.com',
  firstname = 'Jean',
  baseUrl = 'https://unitae.example.com',
  platformName = 'Unitae',
  reason,
}: {
  email: string
  firstname?: string
  baseUrl?: string
  platformName?: string
  reason?: string
}) {
  return (
    <Html>
      <Head />
      <Preview>{m.email_sync_failed_preview()}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              {m.email_sync_failed_heading_line1()}
              <br /> <strong>{m.email_sync_failed_heading_line2()}</strong>
            </Heading>
            <Section>
              <Text>{m.email_sync_done_greeting({ name: firstname ?? email })}</Text>
              <Text>{m.email_sync_failed_body()}</Text>
              <Text>
                <strong>{buildingSyncErrorLabel(reason)}</strong>
              </Text>
              <Text>{m.email_sync_failed_kept()}</Text>
              <Text className="text-center">
                <Link
                  href={`${baseUrl}/territories/buildings/`}
                  className="inline-block rounded-md bg-teal-600 px-3 py-2 text-white"
                >
                  {m.email_sync_failed_button()}
                </Link>
              </Text>
              <Text>{m.email_sync_done_regards()}</Text>
              <Text>{m.email_sync_done_team({ platformName })}</Text>
            </Section>
            <Hr className="mx-0 my-[26px] w-full border border-[#eaeaea] border-solid" />
            <Text className="text-[#666666] text-[12px] leading-[24px]">{m.email_sync_done_footer({ email })}</Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
