import { CalendarCheck, Pencil, X } from 'lucide-react'
import { data, Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { getGroups } from '~/features/publishers/server/groups'
import { getBoolSetting } from '~/features/settings/server/settings'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { computeFilters } from '~/features/territories/server/attribution-filters'
import { findActiveAttributionsPaginated } from '~/features/territories/server/attributions'
import { getCurrentTheocraticYear } from '~/features/territories/server/theocratic-year.server'
import AttributionFilters from '~/features/territories/ui/AttributionFilters'
import { AttributionStatus } from '~/features/territories/ui/AttributionStatus'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import logger from '~/shared/libs/logger.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { Button } from '~/shared/ui/button'

import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
import S13ExportButton from '~/shared/ui/S13ExportButton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Listes des attributions - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, session, can, db } = await authenticateAndAuthorize(request, [
    Role.TerritoriesViewer,
    Role.PublisherManager,
    Role.PublisherViewer,
    Role.TerritoriesManager,
    Role.ProspectionViewer,
  ])
  const canViewTerritories = can(Role.TerritoriesViewer)
  const canManagePublisher = can(Role.PublisherManager)
  const canViewPublisher = can(Role.PublisherViewer)
  const canManageTerritories = can(Role.TerritoriesManager)
  const canViewProspection = can(Role.ProspectionViewer)

  if (!canViewTerritories) {
    if (canViewProspection) {
      throw redirect('/territories/buildings')
    }

    logger.warn(
      `Tried to load territory attributions. User ID: ${currentUser.id}. Does NOT have rights to access territories.`,
    )

    throw redirect('/')
  }

  logger.info(
    `Loading territory attributions. User ID: ${currentUser.id}. ${canManageTerritories ? 'Has' : 'Does NOT have'} rights to manage territories.`,
  )

  const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive)

  const url = new URL(request.url)
  const selectors = computeFilters(url.searchParams)
  selectors.endDate = null

  const { attributions, pagination } = await findActiveAttributionsPaginated(db, selectors, url)

  const messages = { success: session.get('success'), error: session.get('error') }
  const groups = await getGroups(db)
  const theocraticYear = getCurrentTheocraticYear()

  return data(
    {
      messages,
      stats: {
        total: pagination.total,
      },
      attributions,
      pagination,
      canManageTerritories,
      canManagePublisher,
      canViewPublisher,
      groups,
      phoneTypeActive,
      theocraticYear,
    },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function AttributionListPage({ loaderData }: Route.ComponentProps) {
  const {
    messages,
    pagination,
    attributions,
    canManageTerritories,
    theocraticYear,
    groups,
    phoneTypeActive,
    canViewPublisher,
  } = loaderData

  if (attributions.length < 1) {
    return (
      <div className="flex flex-col gap-5">
        <AlertMessages messages={messages} />
        <PageHeader
          title="Attributions"
          subtitle="Liste des attributions en cours"
          actions={
            <>
              <S13ExportButton theocraticYear={theocraticYear} />
              {canManageTerritories && (
                <Button asChild>
                  <Link to="./new/available-territories">Attribuer un territoire</Link>
                </Button>
              )}
            </>
          }
        />

        <AttributionFilters groups={groups} phoneTypeActive={phoneTypeActive} />

        <EmptyState
          icon={CalendarCheck}
          title="Il n'y a aucune attribution pour le moment !"
          description="Pour attribuer un territoire à un proclamateur, utilisez le bouton &laquo; Attribuer un territoire &raquo; en haut à droite de l'écran."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <AlertMessages messages={messages} />
      <PageHeader
        title="Attributions"
        subtitle="Liste des attributions en cours"
        actions={
          <>
            <S13ExportButton theocraticYear={theocraticYear} />
            {canManageTerritories && (
              <Button asChild>
                <Link to="./new/available-territories">Attribuer un territoire</Link>
              </Button>
            )}
          </>
        }
      />

      <AttributionFilters groups={groups} phoneTypeActive={phoneTypeActive} />

      <div className="flex grow flex-col gap-3">
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sortie le</TableHead>
                <TableHead className="text-center">Nº</TableHead>
                <TableHead className="text-center">Proclamateur</TableHead>
                <TableHead className="text-center max-sm:hidden">Type</TableHead>
                <TableHead className="text-center">Statut</TableHead>
                <TableHead className="max-sm:hidden">Notes</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...attributions]
                .sort((attrA, attrB) => {
                  const aIsLate = attrA.lateDate == null || attrA.lateDate < new Date()
                  const bIsLate = attrB.lateDate == null || attrB.lateDate < new Date()
                  if (aIsLate && !bIsLate) {
                    return -1
                  }

                  if (!aIsLate && bIsLate) {
                    return 1
                  }

                  return 0
                })
                .map(attribution => (
                  <TableRow key={attribution.id}>
                    <TableCell>
                      {attribution.startDate.toLocaleDateString('fr-FR')}{' '}
                      <span className="text-muted-foreground text-xs">
                        ({((Date.now() - attribution.startDate.getTime()) / 3600 / 24 / 1000).toFixed(2)} jours)
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Link
                        to={`/territories/territory/${attribution.territoryId}/edit`}
                        className="hover:text-primary"
                      >
                        {attribution.territory.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">
                      {canViewPublisher ? (
                        <Link
                          to={`/congregation/publishers/${attribution.publisherId}/view`}
                          className="hover:text-primary"
                        >
                          {attribution.publisher.lastname?.toLocaleUpperCase()} {attribution.publisher.firstname}
                        </Link>
                      ) : (
                        <>
                          {attribution.publisher.lastname?.toLocaleUpperCase()} {attribution.publisher.firstname}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-center max-sm:hidden">
                      {attribution.type === TerritoryAttributionKind.Default && 'Porte à porte'}
                      {attribution.type === TerritoryAttributionKind.Campaign && 'Campagne de distribution'}
                      {attribution.type === TerritoryAttributionKind.Phone && 'Téléphones'}
                    </TableCell>
                    <TableCell className="text-center">
                      <AttributionStatus attribution={attribution} />
                    </TableCell>
                    <TableCell className="max-sm:hidden">
                      {attribution.notes.length > 0 ? attribution.notes : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canManageTerritories && (
                          <>
                            <Button variant="ghost" size="icon" asChild>
                              <Link to={`./${attribution.id}/edit`}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                            {attribution.endDate == null && (
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                className="text-destructive hover:text-destructive"
                              >
                                <Link
                                  to={`/territories/attributions/${attribution.id}/delete`}
                                  title="Annuler l'attribution"
                                >
                                  <X className="size-4" />
                                </Link>
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>

        <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
      </div>
    </div>
  )
}
