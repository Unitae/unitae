import { Archive, Download, IdCard, Pencil, RotateCcw } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { getPublisherById } from '~/features/publishers/server/publishers.server'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { findActiveAttributionsForPublisher } from '~/features/territories/server/attributions.server'
import { AttributionStatus } from '~/features/territories/ui/AttributionStatus'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { CongregationId, MemberId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Separator } from '~/shared/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/publisher'

function computeServiceYearStart(): number {
  const today = new Date()
  const cutoff = new Date(today.getFullYear(), 8, 1)
  return today < cutoff ? today.getFullYear() - 1 : today.getFullYear()
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [{ title: 'Unitae' }]
  return [{ title: `${loaderData.publisher.firstname} ${loaderData.publisher.lastname} - Unitae` }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canViewPublisher = permissions.has(Permission.PublisherViewer)
  const canManagePublisher = permissions.has(Permission.PublisherManager)
  const canManageActivity = permissions.has(Permission.ActivityManager)
  const canViewTerritories = permissions.has(Permission.TerritoriesViewer)

  if (!canViewPublisher) {
    logger.warn(`Tried to load publisher file. User ID: ${currentUser.id}. Does NOT have rights to view publishers.`)
    throw redirect('/')
  }

  logger.info(
    `Loading publisher file for ${params.publisherId}. User ID: ${currentUser.id}. ${canManagePublisher ? 'Has' : 'Does NOT have'} rights to manage publishers.`,
  )

  const publisherId = requireParamId<MemberId>(params.publisherId, '/publishers')

  return withScopeFromContext(context, async db => {
    const [publisher, attributions] = await Promise.all([
      getPublisherById(db, publisherId, currentUser.congregationId as CongregationId, computeServiceYearStart()),
      findActiveAttributionsForPublisher(db, publisherId, currentUser.congregationId),
    ])

    if (!publisher) {
      throw redirect('/publishers')
    }

    return {
      publisher,
      attributions,
      roles: {
        canViewPublisher,
        canManagePublisher,
        canViewTerritories,
        canManageActivity:
          canManageActivity ||
          publisher.publisherGroup?.responsible.id === currentUser.member?.id ||
          publisher.publisherGroup?.deputy?.id === currentUser.member?.id,
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
        breadcrumbs={[
          { label: m.sidebar_publishers(), to: '/publishers' },
          { label: `${publisher.firstname} ${publisher.lastname}` },
        ]}
        backTo="/publishers"
        actions={
          roles.canManagePublisher && (
            <>
              {roles.canManageActivity && (
                <Button asChild variant="outline" size="icon" title={m.publishers_view_download_s21_title()}>
                  <a href={`/publishers/${publisher.id}/activity/pdf`}>
                    <Download className="size-4" />
                  </a>
                </Button>
              )}
              <Button asChild variant="outline" size="icon" title={m.publishers_view_edit_title()}>
                <Link to="../edit" relative="path">
                  <Pencil className="size-4" />
                </Link>
              </Button>
              {publisher.leftAt != null ? (
                <Form method="post" action={`/settings/users/${publisher.id}/mark-as-returned`}>
                  <Button type="submit" size="icon" title={m.settings_user_mark_as_returned_title()}>
                    <RotateCcw className="size-4" />
                  </Button>
                </Form>
              ) : publisher.isPublisher ? (
                <Form method="post" action={`/settings/users/${publisher.id}/mark-as-left`}>
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
          {publisher.account?.email && (
            <p className="text-muted-foreground text-sm">
              {m.publishers_view_email_address()} :{' '}
              <Link to={`mailto:${publisher.account.email}`} className="font-medium text-primary hover:underline">
                {publisher.account.email}
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
