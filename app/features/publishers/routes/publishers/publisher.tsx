import { Archive, Download, IdCard, Pencil } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { getSession } from '~/features/authentication/server/session.server'
import { PublisherActivityDownloadLink } from '~/features/publishers/ui/PublisherActivityDownloadLink'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { findActiveAttributionsForPublisher } from '~/features/territories/server/attributions.server'
import { AttributionStatus } from '~/features/territories/ui/AttributionStatus'
import * as m from '~/paraglide/messages'
import logger from '~/shared/infra/logger.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { sanitizeUser } from '~/shared/libs/sanitize-user.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Separator } from '~/shared/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/publisher'

export const meta: Route.MetaFunction = ({ data }) => {
  return [{ title: `${data.publisher.firstname} ${data.publisher.lastname} - Unitae` }]
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canViewPublisher = permissions.has(Role.PublisherViewer)
  const canManagePublisher = permissions.has(Role.PublisherManager)
  const canManageActivity = permissions.has(Role.ActivityManager)
  const canViewTerritories = permissions.has(Role.TerritoriesViewer)

  if (!canViewPublisher) {
    logger.warn(`Tried to load publisher file. User ID: ${currentUser.id}. Does NOT have rights to view publishers.`)
    throw redirect('/')
  }

  logger.info(
    `Loading publisher file for ${params.publisherId}. User ID: ${currentUser.id}. ${canManagePublisher ? 'Has' : 'Does NOT have'} rights to manage publishers.`,
  )

  return withScopeFromContext(context, async db => {
    const today = new Date()
    const yearBegining = new Date(today.getFullYear(), 8, 1)
    if (today < yearBegining) {
      yearBegining.setFullYear(today.getFullYear() - 1)
    }
    const publisher = await db.user.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: {
          id: requireParamId(params.publisherId, '/congregation/publishers'),
          congregationId: currentUser.congregationId,
        },
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

    const session = await getSession(request.headers.get('Cookie'))
    const messages = { success: session.get('success'), error: session.get('error') }

    const attributions = await findActiveAttributionsForPublisher(db, publisher.id, currentUser.congregationId)

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
        subtitle={m.publishers_view_subtitle()}
        actions={
          roles.canManagePublisher && (
            <>
              {roles.canManageActivity && (
                <PublisherActivityDownloadLink publisher={publisher}>
                  <Button variant="outline" size="icon" title={m.publishers_view_download_s21_title()} type="button">
                    <Download className="size-4" />
                  </Button>
                </PublisherActivityDownloadLink>
              )}
              <Button asChild variant="outline" size="icon" title={m.publishers_view_edit_title()}>
                <Link to="../edit" relative="path">
                  <Pencil className="size-4" />
                </Link>
              </Button>
              {publisher.isPublisher ? (
                <Form method="post" action={`/settings/users/${publisher.id}/unmake-publisher`}>
                  <Button type="submit" variant="secondary" size="icon" title={m.publishers_view_deactivate_title()}>
                    <Archive className="size-4" />
                  </Button>
                </Form>
              ) : (
                <Form method="post" action={`/settings/users/${publisher.id}/make-publisher`}>
                  <Button type="submit" size="icon" title={m.publishers_view_activate_title()}>
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
          <CardTitle>{m.publishers_view_personal_info()}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex flex-1 flex-col gap-3">
              <p className="text-muted-foreground text-sm">
                {m.publishers_view_gender_label()} :{' '}
                <span className="font-medium text-foreground">
                  {publisher.isMale ? m.publishers_view_gender_male() : m.publishers_view_gender_female()}
                </span>
              </p>
              <p className="text-muted-foreground text-sm">
                {m.publishers_view_birth_date_label()} :{' '}
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
                  {m.publishers_view_baptism_date_label()} :{' '}
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
                  {m.publishers_view_anointed_label()} :{' '}
                  <span className="font-medium text-foreground">
                    {publisher.isAnointed ? m.common_yes() : m.common_no()}
                  </span>
                </p>
                {publisher.isMale && (
                  <>
                    <p className="text-muted-foreground text-sm">
                      {m.publishers_view_elder_label()} :{' '}
                      <span className="font-medium text-foreground">
                        {publisher.isHelder ? m.common_yes() : m.common_no()}
                      </span>
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {m.publishers_view_servant_label()} :{' '}
                      <span className="font-medium text-foreground">
                        {publisher.isServant ? m.common_yes() : m.common_no()}
                      </span>
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
          <CardTitle>{m.publishers_view_contact_info()}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            {m.publishers_view_postal_address()} :{' '}
            <span className="font-medium text-foreground">{publisher.address ? publisher.address : '...'}</span>
          </p>
          <p className="text-muted-foreground text-sm">
            {m.publishers_view_phone()} :{' '}
            <span className="font-medium text-foreground">{publisher.phone ? publisher.phone : '...'}</span>
          </p>
          {!publisher.email.includes('@placeholder.unitae.app') && (
            <p className="text-muted-foreground text-sm">
              {m.publishers_view_email_address()} :{' '}
              <Link to={`mailto:${publisher.email}`} className="font-medium text-primary hover:underline">
                {publisher.email}
              </Link>
            </p>
          )}
          <Separator className="my-2" />
          <p className="text-muted-foreground text-xs italic">{m.publishers_view_contact_secretary_notice()}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.publishers_view_active_attributions()}</CardTitle>
        </CardHeader>
        <CardContent>
          {attributions.length > 0 ? (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{m.publishers_view_territory_number()}</TableHead>
                    <TableHead className="max-sm:hidden">{m.publishers_view_territory_type()}</TableHead>
                    <TableHead className="text-center">{m.publishers_view_territory_start_date()}</TableHead>
                    <TableHead className="text-center">{m.publishers_view_territory_status()}</TableHead>
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
                        {attribution.territory.type === TerritoryKind.Classical &&
                          m.publishers_view_territory_classical()}
                        {attribution.territory.type === TerritoryKind.Commerces &&
                          m.publishers_view_territory_commerces()}
                        {attribution.territory.type === TerritoryKind.Phone && m.publishers_view_territory_phone()}
                        {attribution.territory.type === TerritoryKind.Hotel && m.publishers_view_territory_hotel()}
                        {attribution.territory.type === TerritoryKind.Univ && m.publishers_view_territory_univ()}
                      </TableCell>
                      <TableCell className="text-center">{attribution.startDate.toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell className="text-center">
                        <AttributionStatus attribution={attribution} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm italic">{m.publishers_view_no_attributions()}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
