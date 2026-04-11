import { Archive, Download, IdCard, Pencil } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { sanitizeUser } from '~/features/authentication/server/sanitize-user.server'
import { Role } from '~/features/authorization/model/roles.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { findActiveAttributionsForPublisher } from '~/features/territories/server/attributions'
import { AttributionStatus } from '~/features/territories/ui/AttributionStatus'
import { PublisherActivityDownloadLink } from '~/features/publishers/ui/PublisherActivityDownloadLink'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Separator } from '~/shared/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/publisher'

export const meta: Route.MetaFunction = ({ data }) => {
  return [{ title: `${data.publisher.firstname} ${data.publisher.lastname} - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, session, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.PublisherViewer,
    Role.PublisherManager,
    Role.ActivityManager,
    Role.TerritoriesViewer,
  ])
  const canViewPublisher = can(Role.PublisherViewer)
  const canManagePublisher = can(Role.PublisherManager)
  const canManageActivity = can(Role.ActivityManager)
  const canViewTerritories = can(Role.TerritoriesViewer)

  if (!canViewPublisher) {
    logger.warn(`Tried to load publisher file. User ID: ${currentUser.id}. Does NOT have rights to view publishers.`)
    throw redirect('/')
  }

  logger.info(
    `Loading publisher file for ${params.publisherId}. User ID: ${currentUser.id}. ${canManagePublisher ? 'Has' : 'Does NOT have'} rights to manage publishers.`,
  )

  return withScope(congregationId, async db => {
    const today = new Date()
    const yearBegining = new Date(today.getFullYear(), 8, 1)
    if (today < yearBegining) {
      yearBegining.setFullYear(today.getFullYear() - 1)
    }
    const publisher = await db.user.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: { id: requireParamId(params.publisherId, '/congregation/publishers'), congregationId },
      },
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

    const attributions = await findActiveAttributionsForPublisher(db, publisher.id, congregationId)

    return {
      publisher: sanitizeUser(publisher),
      attributions,
      messages,
      roles: {
        canViewPublisher,
        canManagePublisher,
        canViewTerritories,
        canManageActivity:
          canManageActivity ||
          publisher.publisherGroup?.responsible.id === currentUser.id ||
          publisher.publisherGroup?.deputy?.id === currentUser.id,
      },
    }
  })
}

export default function PublisherPage({ loaderData }: Route.ComponentProps) {
  const { publisher, attributions, roles } = loaderData

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

      <Card>
        <CardHeader>
          <CardTitle>Attributions en cours</CardTitle>
        </CardHeader>
        <CardContent>
          {attributions.length > 0 ? (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead className="max-sm:hidden">Type</TableHead>
                    <TableHead className="text-center">Sortie le</TableHead>
                    <TableHead className="text-center">Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attributions.map(attribution => (
                    <TableRow key={attribution.id}>
                      <TableCell>
                        {roles.canViewTerritories ? (
                          <Link
                            to={`/territories/territory/${attribution.territoryId}/view`}
                            className="hover:text-primary"
                          >
                            {attribution.territory.number}
                          </Link>
                        ) : (
                          attribution.territory.number
                        )}
                      </TableCell>
                      <TableCell className="max-sm:hidden">
                        {attribution.territory.type === TerritoryKind.Classical && 'Porte à porte'}
                        {attribution.territory.type === TerritoryKind.Commerces && 'Commerces'}
                        {attribution.territory.type === TerritoryKind.Phone && 'Téléphones'}
                        {attribution.territory.type === TerritoryKind.Hotel && 'Hôtels'}
                        {attribution.territory.type === TerritoryKind.Univ && 'Universités'}
                      </TableCell>
                      <TableCell className="text-center">
                        {attribution.startDate.toLocaleDateString('fr-FR')}
                      </TableCell>
                      <TableCell className="text-center">
                        <AttributionStatus attribution={attribution} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm italic">Aucune attribution en cours</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
