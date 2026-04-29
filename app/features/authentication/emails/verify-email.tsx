import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Tailwind, Text } from 'react-email'
import * as m from '~/paraglide/messages'

export default function VerifyEmail({
  email = 'test@email.com',
  token = 'e5e560cea5052445767419081f902c1b',
  firstname = 'Jean',
  baseUrl = 'https://unitae.app',
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
    <Html>
      <Head />
      <Preview>{m.email_verify_preview()}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              {m.email_verify_heading()}
            </Heading>
            <Section>
              <Text>{m.email_verify_greeting({ name: firstname ?? email })}</Text>
              <Text>
                {m.email_verify_body()}{' '}
                <Link
                  href={verifyLink}
                  className="text-ellipsis text-wrap break-words break-all text-blue-600 no-underline"
                >
                  {verifyLink}
                </Link>
              </Text>
              <Text>{m.email_verify_regards()}</Text>
              <Text>{m.email_verify_signature({ platformName: platformName ?? 'Unitae' })}</Text>
            </Section>
            <Hr className="mx-0 my-[26px] w-full border border-[#eaeaea] border-solid" />
            <Text className="text-[#666666] text-[12px] leading-[24px]">{m.email_verify_footer({ email })}</Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
