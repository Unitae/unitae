import { Archive, Download, IdCard, Pencil } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { sanitizeUser } from '~/features/authentication/server/sanitize-user.server'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { PublisherActivityDownloadLink } from '~/features/publishers/ui/PublisherActivityDownloadLink'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Separator } from '~/shared/ui/separator'

import type { Route } from './+types/publisher'

export const meta: Route.MetaFunction = ({ data }) => {
  return [{ title: `${data.publisher.firstname} ${data.publisher.lastname} - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, session } = await verifySession(request)
  const canViewPublisher = await verifyRole(request, Role.PublisherViewer)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)
  const canManageActivity = await verifyRole(request, Role.ActivityManager)

  if (!canViewPublisher) {
    logger.warn(`Tried to load publisher file. User ID: ${currentUser.id}. Does NOT have rights to view publishers.`)
    throw redirect('/')
  }

  logger.info(
    `Loading publisher file for ${params.publisherId}. User ID: ${currentUser.id}. ${canManagePublisher ? 'Has' : 'Does NOT have'} rights to manage publishers.`,
  )

  const today = new Date()
  const yearBegining = new Date(today.getFullYear(), 8, 1)
  if (today < yearBegining) {
    yearBegining.setFullYear(today.getFullYear() - 1)
  }
  const publisher = await db.user.findUnique({
    where: { id: requireParamId(params.publisherId, '/congregation/publishers') },
    include: {
      publisherGroup: {
        include: {
          responsible: true,
          deputy: true,
        },
      },
      activities: {
        where: {
          // biome-ignore lint/style/useNamingConvention: prisma syntax
          OR: [
            {
              year: yearBegining.getFullYear(),
              month: {
                gte: 8,
              },
            },
            {
              year: yearBegining.getFullYear() + 1,
              month: {
                lte: 11,
              },
            },
          ],
        },
      },
    },
  })

  if (!publisher) {
    throw redirect('/congregation/publishers')
  }

  const messages = { success: session.get('success'), error: session.get('error') }

  return {
    publisher: sanitizeUser(publisher),
    messages,
    roles: {
      canViewPublisher,
      canManagePublisher,
      canManageActivity:
        canManageActivity ||
        publisher.publisherGroup?.responsible.id === currentUser.id ||
        publisher.publisherGroup?.deputy.id === currentUser.id,
    },
  }
}

export default function PublisherPage({ loaderData }: Route.ComponentProps) {
  const { publisher, roles } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${publisher.firstname} ${publisher.lastname}`}
        subtitle="Fiche du proclamateur. Elle affiche les informations liées à ce proclamateur et auxquelles vous avez accès."
        actions={
          roles.canManagePublisher && (
            <>
              {roles.canManageActivity && (
                <PublisherActivityDownloadLink publisher={publisher}>
                  <Button variant="outline" size="icon" title="Télécharger la fiche d'activité (S-21)" type="button">
                    <Download className="size-4" />
                  </Button>
                </PublisherActivityDownloadLink>
              )}
              <Button asChild variant="outline" size="icon" title="Modifier le proclamateur">
                <Link to="../edit" relative="path">
                  <Pencil className="size-4" />
                </Link>
              </Button>
              {publisher.isPublisher ? (
                <Form method="post" action={`/settings/users/${publisher.id}/unmake-publisher`}>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="icon"
                    title="Désactiver la fiche proclamateur. L'utilisateur ne sera plus proclamateur dans cette assemblée."
                  >
                    <Archive className="size-4" />
                  </Button>
                </Form>
              ) : (
                <Form method="post" action={`/settings/users/${publisher.id}/make-publisher`}>
                  <Button
                    type="submit"
                    size="icon"
                    title="Activer la fiche proclamateur. L'utilisateur sera proclamateur dans cette assemblée."
                  >
                    <IdCard className="size-4" />
                  </Button>
                </Form>
              )}
            </>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex flex-1 flex-col gap-3">
              <p className="text-muted-foreground text-sm">
                Genre : <span className="font-medium text-foreground">{publisher.isMale ? 'Homme' : 'Femme'}</span>
              </p>
              <p className="text-muted-foreground text-sm">
                Date de naissance :{' '}
                <span className="font-medium text-foreground">
                  {publisher.birthDate?.toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </span>
              </p>
              {publisher.baptismDate != null && (
                <p className="text-muted-foreground text-sm">
                  Date de baptême :{' '}
                  <span className="font-medium text-foreground">
                    {publisher.baptismDate?.toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                    })}
                  </span>
                </p>
              )}
            </div>
            {publisher.baptismDate != null && (
              <div className="flex flex-1 flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  Oint : <span className="font-medium text-foreground">{publisher.isAnointed ? 'Oui' : 'Non'}</span>
                </p>
                {publisher.isMale && (
                  <>
                    <p className="text-muted-foreground text-sm">
                      Ancien : <span className="font-medium text-foreground">{publisher.isHelder ? 'Oui' : 'Non'}</span>
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Assistant :{' '}
                      <span className="font-medium text-foreground">{publisher.isServant ? 'Oui' : 'Non'}</span>
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informations de contact</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Adresse postale :{' '}
            <span className="font-medium text-foreground">{publisher.address ? publisher.address : '...'}</span>
          </p>
          <p className="text-muted-foreground text-sm">
            Téléphone : <span className="font-medium text-foreground">{publisher.phone ? publisher.phone : '...'}</span>
          </p>
          {!publisher.email.includes('@placeholder.unitae.app') && (
            <p className="text-muted-foreground text-sm">
              Adresse email :{' '}
              <Link to={`mailto:${publisher.email}`} className="font-medium text-primary hover:underline">
                {publisher.email}
              </Link>
            </p>
          )}
          <Separator className="my-2" />
          <p className="text-muted-foreground text-xs italic">
            Si certaines de ces informations ne sont pas bonnes, merci de contacter le secrétaire.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
