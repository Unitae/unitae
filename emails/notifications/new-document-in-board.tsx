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

export default function NewDocumentInBoard({
  email = 'test@email.com',
  firstname = 'Jean',
  filename = 'Réunions publiques',
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
      <Preview>Un nouveau document a été ajouté au tableau d'affichage...</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              Nouveau <strong>document</strong>
              <br /> disponible sur le tableau d'affichage.
            </Heading>
            <Section>
              <Text>Bonjour {firstname ?? email},</Text>
              <Text>
                Un nouveau document appelé <strong>"{filename}"</strong> a été ajouté au tableau d'affichage de
                l'assemblée.
              </Text>
              <Text>
                Vous recevez ce mail car vous possèdez les droits pour{' '}
                <strong>décider de rendre accessible ce document</strong> à tous les proclamateurs.
              </Text>
              <Text>
                Pour modifier la visibilité du document, visitez la page "Liste des documents" dans le module du tableau
                d'affichage ou cliquez sur ce button :{' '}
              </Text>
              <Text className="text-center">
                <Link
                  href={`${baseUrl}/board/documents/${documentId}/edit`}
                  className="inline-block rounded-md bg-teal-600 px-3 py-2 text-white"
                >
                  Modifier le document
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
