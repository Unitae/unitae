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
} from '@react-email/components'

export default function BuildingSyncDone({
  email = 'test@email.com',
  firstname = 'Jean',
  baseUrl = 'https://unitae.app',
  platformName = 'Unitae',
}: {
  email: string
  firstname?: string
  baseUrl?: string
  platformName?: string
}) {
  return (
    <Html>
      <Head />
      <Preview>La synchronisation des bâtiments du territoire avec les données du gouvernement est terminée...</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              Synchronisation
              <br /> des <strong>bâtiments</strong> ternimée.
            </Heading>
            <Section>
              <Text>Bonjour {firstname ?? email},</Text>
              <Text>
                Depuis le module de gestion des territoires, vous avez demandé une synchronisation des données de la
                plateforme avec celles des bases d'adresses ouvertes du gouvernement.
              </Text>
              <Text>
                Cette synchronisation <strong>est terminée</strong>.
              </Text>
              <Text>
                Pour voir le résultat visitez la page "Prospection" dans le module des territoires ou cliquez sur ce
                button :{' '}
              </Text>
              <Text className="text-center">
                <Link
                  href={`${baseUrl}/territories/buildings/`}
                  className="inline-block rounded-md bg-teal-600 px-3 py-2 text-white"
                >
                  Voir les mises à jour
                </Link>
              </Text>
              <Text>Cordialement,</Text>
              <Text>L'équipe {platformName}</Text>
            </Section>
            <Hr className="mx-0 my-[26px] w-full border border-[#eaeaea] border-solid" />
            <Text className="text-[#666666] text-[12px] leading-[24px]">
              Cet email est destiné à <span className="text-black">{email}</span>. Si vous n'attendiez pas cet email,
              vous pouvez l'ignorer.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
