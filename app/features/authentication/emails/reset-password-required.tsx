import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Tailwind, Text } from 'react-email'
import * as m from '~/paraglide/messages'

export default function ResetPasswordRequired({
  email = 'test@email.com',
  token = 'e5e560cea5052445767419081f902c1b.abc3d54f092d690db954825aa6373ec5a3baa131db338769848e0c7507a061b3',
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
  const resetLink = `${baseUrl}/password/${token}/reset/`

  return (
    <Html>
      <Head />
      <Preview>{m.email_reset_password_preview()}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              {m.email_reset_password_required_heading()}
            </Heading>
            <Section>
              <Text>{m.email_reset_password_greeting({ name: firstname ?? email })}</Text>
              <Text>
                {m.email_reset_password_required_body()}{' '}
                <Link
                  href={resetLink}
                  className="text-ellipsis text-wrap break-words break-all text-blue-600 no-underline"
                >
                  {resetLink}
                </Link>
              </Text>
              <Text>{m.email_reset_password_regards()}</Text>
              <Text>{m.email_reset_password_signature({ platformName: platformName ?? 'Unitae' })}</Text>
            </Section>
            <Hr className="mx-0 my-[26px] w-full border border-[#eaeaea] border-solid" />
            <Text className="text-[#666666] text-[12px] leading-[24px]">
              {m.email_reset_password_footer({ email })}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
