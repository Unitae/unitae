import { Map as MapIcon, Pencil, Trash2 } from 'lucide-react'
import { data, Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { getBoolSetting } from '~/features/settings/server/settings'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { getZips } from '~/features/territories/server/buildings'
import { findTerritoriesWithDetailsPaginated } from '~/features/territories/server/territories'
import { computeFilters } from '~/features/territories/server/territory-filters'
import { TerritoryDownloadLink } from '~/features/territories/ui/TerritoryDownloadLink'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { getOptionalEnv } from '~/shared/libs/env.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { Button } from '~/shared/ui/button'

import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Tous les territoires - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.TerritoriesViewer,
    Role.TerritoriesManager,
  ])
  const canViewTerritories = can(Role.TerritoriesViewer)

  if (!canViewTerritories) {
    throw redirect('/')
  }

  const canManageTerritories = can(Role.TerritoriesManager)

  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
  const mapId = getOptionalEnv('GOOGLE_MAPS_MAP_ID')

  return withScope(congregationId, async db => {
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
          title="Territoires"
          subtitle="Liste des territoires de l'assemblée locale"
          actions={
            canManageTerritories && (
              <Button asChild>
                <Link to="./territory/new">Nouveau territoire</Link>
              </Button>
            )
          }
        />

        <TerritoryFilters zips={zips} showAccess showSearch showType showZip />

        <EmptyState
          icon={MapIcon}
          title="Il n'y a aucun territoire pour le moment !"
          description="Pour ajouter des territoires, utilisez le bouton &laquo; Nouveau territoire &raquo; ou visitez le module de découpage des territoires sur la page de prospection."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <AlertMessages messages={messages} />
      <PageHeader
        title="Territoires"
        subtitle="Liste des territoires de l'assemblée locale"
        actions={
          canManageTerritories && (
            <Button asChild>
              <Link to="./territory/new">Nouveau territoire</Link>
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
                <TableHead>Nº</TableHead>
                <TableHead className="text-center">Type</TableHead>
                <TableHead className="text-center">Foyer</TableHead>
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
                      {territory.type === TerritoryKind.Classical && 'Porte à porte'}
                      {territory.type === TerritoryKind.Commerces && 'Commerces'}
                      {territory.type === TerritoryKind.Phone && 'Téléphones'}
                      {territory.type === TerritoryKind.Hotel && 'Hôtels'}
                      {territory.type === TerritoryKind.Univ && 'Universités'}
                    </TableCell>
                    <TableCell className="text-center">
                      {territory.entrances.reduce(
                        (count, entrance) => count + ((entrance.homes ?? 0) || (entrance.phones ?? 0)),
                        0,
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
                              <Link to={`./territory/${territory.id}/edit`} title="Modifier le territoire">
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                              className="text-destructive hover:text-destructive max-sm:hidden"
                            >
                              <Link
                                to={`./territory/${territory.id}/delete`}
                                title="Supprimer complètement le territoire"
                              >
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
