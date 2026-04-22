import { CalendarCheck, Download, ExternalLink, Pencil, X } from 'lucide-react'
import { Link, redirect } from 'react-router'
import type { Attribution, User } from '~/database/generated/client'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { findTerritoryWithHistory } from '~/features/territories/server/attributions.server'
import { aggregateEntrance } from '~/features/territories/server/buildings.server'
import { computeTerritoryQuantity } from '~/features/territories/server/compute-territory-quantity'
import { AttributionStatus } from '~/features/territories/ui/AttributionStatus'
import BuildingEntranceMap from '~/features/territories/ui/BuildingEntranceMap'
import { TerritoryDownloadLink } from '~/features/territories/ui/TerritoryDownloadLink'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { Role } from '~/shared/types/role'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/view'

export const meta: Route.MetaFunction = ({ data }) => {
  return [{ title: m.territories_edit_meta_title({ number: String(data.territory.number) }) }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesViewer)) {
    throw redirect('/')
  }

  const canManageTerritories = permissions.has(Role.TerritoriesManager)
  const canViewPublisher = permissions.has(Role.PublisherViewer)
  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const territory = await findTerritoryWithHistory(
      db,
      requireParamId(params.territoryId, '/territories'),
      congregationId,
    )

    if (territory == null) {
      throw redirect('/territories', { status: 404 })
    }

    const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
    const mapId = getOptionalEnv('GOOGLE_MAPS_MAP_ID')
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)

    return {
      territory,
      territoryEntrances: territory.entrances.map(aggregateEntrance),
      googleMaps: { mapId, apiKey },
      phoneTypeActive,
      canManageTerritories,
      canViewPublisher,
    }
  })
}

function getTerritoryTypeLabel(type: string): string {
  const labels: Record<string, () => string> = {
    [TerritoryKind.Classical]: () => m.territories_type_classical_capitalized(),
    [TerritoryKind.Commerces]: () => m.territories_type_commerces(),
    [TerritoryKind.Hotel]: () => m.territories_type_hotel(),
    [TerritoryKind.Phone]: () => m.territories_type_phone_singular(),
    [TerritoryKind.Univ]: () => m.territories_type_university_singular(),
  }
  return labels[type]?.() ?? type
}

function CurrentAttributionSection({
  attribution,
  territoryId,
  canManageTerritories,
  canViewPublisher,
}: {
  attribution: (Attribution & { publisher: User }) | undefined
  territoryId: number
  canManageTerritories: boolean
  canViewPublisher: boolean
}) {
  if (attribution == null) {
    return (
      <>
        <div className="flex items-center justify-center gap-3 rounded-md border p-3">
          <span className="text-muted-foreground italic">{m.territories_view_no_attribution()}</span>
        </div>
        {canManageTerritories && (
          <Button variant="secondary" asChild>
            <Link to={`/territories/attributions/new?territory=${territoryId}`}>
              {m.territories_view_assign_button()}
            </Link>
          </Button>
        )}
      </>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="flex flex-col">
        <span className="font-medium">
          {canViewPublisher ? (
            <Link to={`/publishers/${attribution.publisherId}`} className="hover:text-primary">
              {attribution.publisher.firstname} {attribution.publisher.lastname?.toLocaleUpperCase()}
            </Link>
          ) : (
            <>
              {attribution.publisher.firstname} {attribution.publisher.lastname?.toLocaleUpperCase()}
            </>
          )}
        </span>
        <span className="text-muted-foreground text-sm">
          {attribution.startDate.toLocaleDateString('fr-FR')} - {attribution.lateDate.toLocaleDateString('fr-FR')}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <AttributionStatus attribution={attribution} />
        {canManageTerritories && (
          <>
            <Button variant="ghost" size="icon" asChild>
              <Link
                to={`/territories/attributions/${attribution.id}/edit`}
                title={m.territories_edit_view_attribution_title()}
              >
                <ExternalLink className="size-4 text-primary" />
              </Link>
            </Button>
            {attribution.endDate == null && (
              <Button variant="ghost" size="icon" asChild className="text-destructive hover:text-destructive">
                <Link
                  to={`/territories/attributions/${attribution.id}/delete`}
                  title={m.territories_edit_cancel_attribution_title()}
                >
                  <X className="size-4" />
                </Link>
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function AttributionHistoryTable({
  attributions,
  canViewPublisher,
}: {
  attributions: (Attribution & { publisher: User })[]
  canViewPublisher: boolean
}) {
  if (attributions.length < 1) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title={m.territories_view_empty_history_title()}
        description={m.territories_view_empty_history_description()}
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.territories_view_table_publisher()}</TableHead>
            <TableHead className="text-center">{m.territories_view_table_checkout_date()}</TableHead>
            <TableHead className="text-center">{m.territories_view_table_return_date()}</TableHead>
            <TableHead className="text-center max-sm:hidden">{m.territories_view_table_duration()}</TableHead>
            <TableHead className="text-center max-sm:hidden">{m.territories_view_table_type()}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {attributions.map(attribution => {
            const durationDays = attribution.endDate
              ? Math.round((attribution.endDate.getTime() - attribution.startDate.getTime()) / (1000 * 60 * 60 * 24))
              : null

            return (
              <TableRow key={attribution.id}>
                <TableCell>
                  {canViewPublisher ? (
                    <Link to={`/publishers/${attribution.publisherId}`} className="hover:text-primary">
                      {attribution.publisher.lastname?.toLocaleUpperCase()} {attribution.publisher.firstname}
                    </Link>
                  ) : (
                    <>
                      {attribution.publisher.lastname?.toLocaleUpperCase()} {attribution.publisher.firstname}
                    </>
                  )}
                </TableCell>
                <TableCell className="text-center">{attribution.startDate.toLocaleDateString('fr-FR')}</TableCell>
                <TableCell className="text-center">{attribution.endDate?.toLocaleDateString('fr-FR')}</TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {durationDays != null ? m.territories_view_duration_days({ days: String(durationDays) }) : '-'}
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {attribution.type === 'default' && m.territories_view_attribution_type_default()}
                  {attribution.type === 'campaign' && m.territories_view_attribution_type_campaign()}
                  {attribution.type === 'phones' && m.territories_view_attribution_type_phones()}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export default function ViewTerritoryPage({ loaderData }: Route.ComponentProps) {
  const {
    territory,
    territoryEntrances,
    googleMaps: { mapId, apiKey },
    phoneTypeActive,
    canManageTerritories,
    canViewPublisher,
  } = loaderData

  const currentAttribution = territory.attributions.find(a => a.endDate == null)
  const pastAttributions = territory.attributions.filter(a => a.endDate != null)
  const quantity = computeTerritoryQuantity(territory.type, territoryEntrances)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.territories_view_title({ number: String(territory.number) })}
        subtitle={m.territories_view_subtitle()}
        breadcrumbs={[{ label: m.sidebar_territories(), to: '/territories' }, { label: territory.number }]}
        backTo="/territories"
        actions={
          <>
            <TerritoryDownloadLink
              territory={territory}
              entrances={territory.entrances}
              googleMapId={mapId}
              googleMapKey={apiKey}
              owner={
                currentAttribution
                  ? `${currentAttribution.publisher.firstname} ${currentAttribution.publisher.lastname?.toUpperCase().at(0)}.`
                  : undefined
              }
              restitutionDate={currentAttribution?.lateDate}
              showPhone={!phoneTypeActive}
              attributionType={currentAttribution?.type as TerritoryAttributionKind}
            >
              <Button variant="outline" size="icon" title={m.territories_download_pdf_title()}>
                <Download className="size-4" />
              </Button>
            </TerritoryDownloadLink>

            {canManageTerritories && (
              <Button asChild variant="outline" size="icon" title={m.territories_edit_title_attr()}>
                <Link to="../edit" relative="path">
                  <Pencil className="size-4" />
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex gap-10 max-sm:flex-col">
        <div className="flex flex-1 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{m.territories_view_info_title()}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  {m.territories_view_number_label()}{' '}
                  <span className="font-medium text-foreground">{territory.number}</span>
                </p>
                <p className="text-muted-foreground text-sm">
                  {m.territories_view_type_label()}{' '}
                  <span className="font-medium text-foreground">{getTerritoryTypeLabel(territory.type)}</span>
                </p>
                <p className="text-muted-foreground text-sm">
                  {territory.type === TerritoryKind.Phone
                    ? m.territories_view_phones_count_label()
                    : m.territories_view_homes_count_label()}{' '}
                  <span className="font-medium text-foreground">{quantity}</span>
                </p>
                {territory.notes.length > 0 && (
                  <p className="text-muted-foreground text-sm">
                    {m.territories_view_notes_label()}{' '}
                    <span className="font-medium text-foreground">{territory.notes}</span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {territory.type === TerritoryKind.Commerces && territoryEntrances.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{m.territories_view_commerces_title()}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {territoryEntrances.map(entrance => (
                    <div key={entrance.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {entrance.number} {entrance.street}, {entrance.zip}
                        </span>
                        <span className="text-muted-foreground text-sm">{entrance.shopKind || '-'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {territory.type !== TerritoryKind.Commerces && territoryEntrances.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{m.territories_view_entrances_title()}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {territoryEntrances.map(entrance => (
                    <div key={entrance.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {entrance.number} {entrance.street}, {entrance.zip}
                        </span>
                        <span className="text-muted-foreground text-sm">
                          {m.territories_form_homes_count({ count: String(entrance.homes || entrance.phones) })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <h2 className="font-semibold text-lg">{m.territories_view_current_attribution_heading()}</h2>
          <CurrentAttributionSection
            attribution={currentAttribution}
            territoryId={territory.id}
            canManageTerritories={canManageTerritories}
            canViewPublisher={canViewPublisher}
          />

          <h2 className="font-semibold text-lg">{m.territories_view_history_heading()}</h2>
          <AttributionHistoryTable attributions={pastAttributions} canViewPublisher={canViewPublisher} />
        </div>

        <BuildingEntranceMap apiKey={apiKey} entrances={territory.entrances} />
      </div>
    </div>
  )
}
