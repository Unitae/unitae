import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Pencil,
  StickyNote,
  UserPlus,
  X,
} from 'lucide-react'
import { Link, redirect } from 'react-router'
import type { Attribution, Member } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { findAdjacentTerritories, findTerritoryWithHistory } from '~/features/territories/server/attributions.server'
import { aggregateEntrance } from '~/features/territories/server/buildings.server'
import { entranceContentLabel } from '~/features/territories/server/entrance-content-label'
import { territoryContentLabel } from '~/features/territories/server/territory-content-label'
import { AttributionStatus } from '~/features/territories/ui/AttributionStatus'
import BuildingEntranceMap from '~/features/territories/ui/BuildingEntranceMap'

import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Progress } from '~/shared/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/view'

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [{ title: 'Unitae' }]
  return [{ title: m.territories_view_meta_title({ number: String(loaderData.territory.number) }) }]
}

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.CanViewTerritories)

  const canManageTerritories = permissions.has(Permission.CanManageTerritories)
  const canViewPublisher = permissions.has(Permission.CanViewPublishers)
  const { congregationId } = context.get(currentAccountContext)
  const from = new URL(request.url).searchParams.get('from')

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
    const adjacent = await findAdjacentTerritories(db, territory.number, territory.type, congregationId)

    return {
      territory,
      territoryEntrances: territory.entrances.map(aggregateEntrance),
      googleMapsApiKey: apiKey,
      canManageTerritories,
      canViewPublisher,
      adjacent,
      from,
    }
  })
}

function getTerritoryTypeLabel(type: string): string {
  const labels: Record<string, () => string> = {
    [TerritoryKindKey.Classical]: () => m.territories_type_classical_capitalized(),
    [TerritoryKindKey.Commerces]: () => m.territories_type_commerces(),
    [TerritoryKindKey.Hotel]: () => m.territories_type_hotel(),
    [TerritoryKindKey.Phone]: () => m.territories_type_phone_singular(),
    [TerritoryKindKey.Univ]: () => m.territories_type_university_singular(),
  }
  return labels[type]?.() ?? type
}

function publisherInitials(publisher: Member): string {
  const first = publisher.firstname?.charAt(0) ?? ''
  const last = publisher.lastname?.charAt(0) ?? ''
  return `${first}${last}`.toLocaleUpperCase()
}

function CurrentAttributionCard({
  attribution,
  territoryId,
  canManageTerritories,
  canViewPublisher,
}: {
  attribution: (Attribution & { publisher: Member }) | undefined
  territoryId: number
  canManageTerritories: boolean
  canViewPublisher: boolean
}) {
  if (attribution == null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.territories_view_current_attribution_heading()}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={UserPlus}
            title={m.territories_view_no_attribution()}
            description={m.territories_view_no_attribution_body()}
            action={
              canManageTerritories ? (
                <Button asChild>
                  <Link to={`/territories/attributions/new?territory=${territoryId}`}>
                    {m.territories_view_assign_button()}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    )
  }

  const totalMs = attribution.lateDate.getTime() - attribution.startDate.getTime()
  const elapsedMs = Date.now() - attribution.startDate.getTime()
  const rawPercent = totalMs > 0 ? Math.round((elapsedMs / totalMs) * 100) : 0
  const percent = Math.max(0, Math.min(100, rawPercent))
  const isLate = attribution.lateDate < new Date()

  const publisherName = formatPersonName(attribution.publisher)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>{m.territories_view_current_attribution_heading()}</span>
          <AttributionStatus attribution={attribution} />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="flex size-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-sm"
              aria-hidden="true"
            >
              {publisherInitials(attribution.publisher)}
            </span>
            <div className="flex flex-col">
              <span className="font-medium">
                {canViewPublisher ? (
                  <Link to={`/publishers/${attribution.publisherId}/view`} className="hover:text-primary">
                    {publisherName}
                  </Link>
                ) : (
                  publisherName
                )}
              </span>
              <span className="text-muted-foreground text-sm">
                {attribution.startDate.toLocaleDateString('fr-FR')} — {attribution.lateDate.toLocaleDateString('fr-FR')}
              </span>
            </div>
          </div>
          {canManageTerritories && (
            <div className="flex items-center gap-1">
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
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Progress value={percent} className={isLate ? '[&>div]:bg-destructive' : ''} />
          <p className="text-muted-foreground text-xs">
            {m.territories_view_attribution_progress({ percent: String(percent) })}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function AttributionHistoryCard({
  attributions,
  canViewPublisher,
}: {
  attributions: (Attribution & { publisher: Member })[]
  canViewPublisher: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{m.territories_view_history_heading()}</CardTitle>
      </CardHeader>
      <CardContent>
        {attributions.length < 1 ? (
          <EmptyState
            icon={CalendarCheck}
            title={m.territories_view_empty_history_title()}
            description={m.territories_view_empty_history_description()}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border">
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
                    ? Math.round(
                        (attribution.endDate.getTime() - attribution.startDate.getTime()) / (1000 * 60 * 60 * 24),
                      )
                    : null

                  return (
                    <TableRow key={attribution.id}>
                      <TableCell>
                        {canViewPublisher ? (
                          <Link to={`/publishers/${attribution.publisherId}/view`} className="hover:text-primary">
                            {formatPersonName(attribution.publisher)}
                          </Link>
                        ) : (
                          formatPersonName(attribution.publisher)
                        )}
                      </TableCell>
                      <TableCell className="text-center">{attribution.startDate.toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell className="text-center">{attribution.endDate?.toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell className="text-center max-sm:hidden">
                        {durationDays != null ? m.territories_view_duration_days({ days: String(durationDays) }) : '-'}
                      </TableCell>
                      <TableCell className="text-center max-sm:hidden">
                        {attribution.campaignId != null
                          ? m.territories_view_attribution_type_campaign()
                          : attribution.type === TerritoryAttributionKind.Phone
                            ? m.territories_view_attribution_type_phones()
                            : m.territories_view_attribution_type_default()}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ViewTerritoryPage({ loaderData }: Route.ComponentProps) {
  const { territory, territoryEntrances, googleMapsApiKey, canManageTerritories, canViewPublisher, adjacent, from } =
    loaderData

  const currentAttribution = territory.attributions.find(a => a.endDate == null)
  const pastAttributions = territory.attributions.filter(a => a.endDate != null)
  const contentLabel = territoryContentLabel(territory.type, territoryEntrances)
  const fromQuery = from != null && from.length > 0 ? `?from=${encodeURIComponent(from)}` : ''
  const backTo = from != null && from.length > 0 ? `/territories?${from}` : '/territories'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.territories_view_title({ number: String(territory.number) })}
        subtitle={m.territories_view_subtitle()}
        breadcrumbs={[{ label: m.sidebar_territories(), to: backTo }, { label: territory.number }]}
        backTo={backTo}
        actions={
          <>
            {adjacent.prev != null ? (
              <Button asChild variant="ghost" size="icon" title={m.territories_view_prev_title()}>
                <Link to={`/territories/territory/${adjacent.prev.id}/view${fromQuery}`}>
                  <ChevronLeft className="size-4" />
                </Link>
              </Button>
            ) : (
              <Button variant="ghost" size="icon" disabled title={m.territories_view_prev_title()}>
                <ChevronLeft className="size-4" />
              </Button>
            )}
            {adjacent.next != null ? (
              <Button asChild variant="ghost" size="icon" title={m.territories_view_next_title()}>
                <Link to={`/territories/territory/${adjacent.next.id}/view${fromQuery}`}>
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <Button variant="ghost" size="icon" disabled title={m.territories_view_next_title()}>
                <ChevronRight className="size-4" />
              </Button>
            )}
            <Button asChild variant="outline" size="icon" title={m.territories_download_pdf_title()}>
              <a href={`/territories/territory/${territory.id}/pdf`}>
                <Download className="size-4" />
              </a>
            </Button>

            {canManageTerritories && (
              <Button asChild variant="outline" title={m.territories_edit_title_attr()}>
                <Link to={`../edit${fromQuery}`} relative="path">
                  <Pencil className="size-4" />
                  <span className="max-lg:sr-only">{m.territories_view_edit_label()}</span>
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex gap-6 max-lg:flex-col lg:items-start">
        <div className="flex flex-1 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{m.territories_view_info_title()}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{m.territories_view_number_label()}</dt>
                <dd className="font-medium">{territory.number}</dd>
                <dt className="text-muted-foreground">{m.territories_view_type_label()}</dt>
                <dd className="font-medium">{getTerritoryTypeLabel(territory.type)}</dd>
                <dt className="text-muted-foreground">
                  {territory.type === TerritoryKindKey.Phone
                    ? m.territories_view_phones_count_label()
                    : m.territories_view_homes_count_label()}
                </dt>
                <dd className="font-medium text-primary">{contentLabel}</dd>
              </dl>
            </CardContent>
          </Card>

          {territory.notes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <StickyNote className="size-4 text-muted-foreground" aria-hidden="true" />
                  {m.territories_view_notes_card_title()}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{territory.notes}</p>
              </CardContent>
            </Card>
          )}

          {territoryEntrances.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span>{m.territories_view_entrances_title()}</span>
                  <span className="text-muted-foreground text-sm">({territoryEntrances.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {territoryEntrances.map(entrance => (
                  <div key={entrance.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {entrance.number} {entrance.street}, {entrance.zip}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {entranceContentLabel(territory.type, entrance)}
                      </span>
                    </div>
                    {entrance.buildings[0] != null ? (
                      <Button variant="ghost" size="icon" asChild>
                        <a
                          href={`/territories/building/${entrance.buildings[0].id}/view`}
                          target="_blank"
                          rel="noreferrer"
                          title={m.territories_form_view_building_title()}
                        >
                          <ExternalLink className="size-4 text-primary" />
                        </a>
                      </Button>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <CurrentAttributionCard
            attribution={currentAttribution}
            territoryId={territory.id}
            canManageTerritories={canManageTerritories}
            canViewPublisher={canViewPublisher}
          />

          <AttributionHistoryCard attributions={pastAttributions} canViewPublisher={canViewPublisher} />
        </div>

        {googleMapsApiKey != null && (
          <BuildingEntranceMap
            apiKey={googleMapsApiKey}
            entrances={territory.entrances}
            className="h-[calc(100vh-12rem)] min-h-[320px] w-full lg:sticky lg:top-4 lg:w-2/5 xl:w-1/2"
            mapClassName="h-full w-full rounded-lg"
          />
        )}
      </div>
    </div>
  )
}
