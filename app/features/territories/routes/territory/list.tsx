import { Map as MapIcon, Pencil, Trash2 } from 'lucide-react'
import { data, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { getZips } from '~/features/territories/server/buildings.server'
import { findTerritoriesWithDetailsPaginated } from '~/features/territories/server/territories.server'
import { computeFilters } from '~/features/territories/server/territory-filters.server'
import { TerritoryDownloadLink } from '~/features/territories/ui/TerritoryDownloadLink'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { Role } from '~/shared/types/role'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { getOptionalEnv } from '~/shared/utils/env.server'

import type { Route } from './+types/list'

const territoryTypeLabels: Record<string, string> = {
  [TerritoryKind.Classical]: m.territories_type_classical(),
  [TerritoryKind.Commerces]: m.territories_type_commerces(),
  [TerritoryKind.Phone]: m.territories_type_phone(),
  [TerritoryKind.Hotel]: m.territories_type_hotel(),
  [TerritoryKind.Univ]: m.territories_type_university(),
}

function territoryContentLabel(type: string, entrances: { homes: number | null; phones: number | null }[]): string {
  const count = entrances.length
  if (type === TerritoryKind.Phone) {
    const phones = entrances.reduce((s, e) => s + (e.phones ?? 0), 0)
    return m.territories_content_phones({ count: phones })
  }
  if (type === TerritoryKind.Classical || type === TerritoryKind.Univ) {
    const homes = entrances.reduce((s, e) => s + ((e.homes ?? 0) || (e.phones ?? 0)), 0)
    return homes > 1
      ? m.territories_content_homes_other({ count: homes })
      : m.territories_content_homes_one({ count: homes })
  }
  if (type === TerritoryKind.Commerces) {
    return count > 1 ? m.territories_content_commerces_other({ count }) : m.territories_content_commerces_one({ count })
  }
  if (type === TerritoryKind.Hotel) {
    return count > 1 ? m.territories_content_hotels_other({ count }) : m.territories_content_hotels_one({ count })
  }
  return count > 1 ? m.territories_content_entrances_other({ count }) : m.territories_content_entrances_one({ count })
}

export const meta: Route.MetaFunction = () => {
  return [{ title: m.territories_list_meta_title() }]
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesViewer)) {
    throw redirect('/')
  }

  const canManageTerritories = permissions.has(Role.TerritoriesManager)

  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
  const mapId = getOptionalEnv('GOOGLE_MAPS_MAP_ID')

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)

    const url = new URL(request.url)
    const selectors = await computeFilters(url.searchParams)
    const { territories, pagination } = await findTerritoriesWithDetailsPaginated(db, selectors, url, congregationId)

    const messages = {
      success: session.get('success'),
      error: session.get('error'),
    }
    const zips = await getZips(db, congregationId)

    return data(
      {
        messages,
        zips,
        stats: {
          total: pagination.total,
        },
        territories,
        pagination,
        googleMaps: { mapId, apiKey },
        canManageTerritories,
        phoneTypeActive,
      },
      {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      },
    )
  })
}

export default function TerritoryListPage({ loaderData }: Route.ComponentProps) {
  const {
    messages,
    pagination,
    territories,
    canManageTerritories,
    googleMaps: { mapId, apiKey },
    zips,
    phoneTypeActive,
  } = loaderData

  if (territories.length < 1) {
    return (
      <div className="flex flex-col gap-5">
        <AlertMessages messages={messages} />

        <PageHeader
          title={m.territories_title()}
          subtitle={m.territories_subtitle()}
          actions={
            canManageTerritories && (
              <Button asChild>
                <Link to="./territory/new">{m.territories_new_button()}</Link>
              </Button>
            )
          }
        />

        <TerritoryFilters zips={zips} showAccess showSearch showType showZip />

        <EmptyState
          icon={MapIcon}
          title={m.territories_empty_title()}
          description={m.territories_empty_description()}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <AlertMessages messages={messages} />
      <PageHeader
        title={m.territories_title()}
        subtitle={m.territories_subtitle()}
        actions={
          canManageTerritories && (
            <Button asChild>
              <Link to="./territory/new">{m.territories_new_button()}</Link>
            </Button>
          )
        }
      />

      <TerritoryFilters zips={zips} showAccess showSearch showType showZip />

      <div className="flex grow flex-col gap-3">
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.territories_table_number()}</TableHead>
                <TableHead className="text-center">{m.territories_table_type()}</TableHead>
                <TableHead className="text-center">{m.territories_table_content()}</TableHead>
                <TableHead>{m.territories_table_assigned_to()}</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {territories.map(territory => {
                const attribution = [...territory.attributions].shift()

                return (
                  <TableRow key={territory.id}>
                    <TableCell>
                      <Link to={`./territory/${territory.id}/view`} className="hover:text-primary">
                        {territory.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">
                      {territoryTypeLabels[territory.type] ?? territory.type}
                    </TableCell>
                    <TableCell className="text-center">
                      {territoryContentLabel(territory.type, territory.entrances)}
                    </TableCell>
                    <TableCell>
                      {attribution ? (
                        <span className={attribution.lateDate < new Date() ? 'text-destructive' : ''}>
                          {attribution.publisher.firstname} {attribution.publisher.lastname?.toUpperCase().at(0)}.
                          {' — '}
                          {m.territories_assigned_until({
                            date: attribution.lateDate.toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                            }),
                          })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{m.territories_available()}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <TerritoryDownloadLink
                          territory={territory}
                          entrances={territory.entrances}
                          googleMapId={mapId}
                          googleMapKey={apiKey}
                          attributionType={attribution?.type as TerritoryAttributionKind}
                          owner={
                            attribution
                              ? `${attribution.publisher.firstname} ${attribution.publisher.lastname
                                  ?.toUpperCase()
                                  .at(0)}.`
                              : undefined
                          }
                          restitutionDate={attribution?.lateDate}
                          showPhone={!phoneTypeActive}
                        />
                        {canManageTerritories && (
                          <>
                            <Button variant="ghost" size="icon" asChild>
                              <Link to={`./territory/${territory.id}/edit`} title={m.territories_edit_title_attr()}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                              className="text-destructive hover:text-destructive max-sm:hidden"
                            >
                              <Link to={`./territory/${territory.id}/delete`} title={m.territories_delete_title_attr()}>
                                <Trash2 className="size-4" />
                              </Link>
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
      </div>
    </div>
  )
}
