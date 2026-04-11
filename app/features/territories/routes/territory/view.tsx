import { CalendarCheck, Download, ExternalLink, Pencil, X } from 'lucide-react'
import { Link, redirect } from 'react-router'
import type { Attribution, User } from '~/database/generated/client'
import { Role } from '~/features/authorization/model/roles.type'
import { getBoolSetting } from '~/features/settings/server/settings'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { findTerritoryWithHistory } from '~/features/territories/server/attributions'
import { aggregateEntrance } from '~/features/territories/server/buildings'
import { computeTerritoryQuantity } from '~/features/territories/server/compute-territory-quantity'
import { AttributionStatus } from '~/features/territories/ui/AttributionStatus'
import BuildingEntranceMap from '~/features/territories/ui/BuildingEntranceMap'
import { TerritoryDownloadLink } from '~/features/territories/ui/TerritoryDownloadLink'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { getOptionalEnv } from '~/shared/libs/env.server'
import { requireParamId } from '~/shared/libs/params.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/view'

export const meta: Route.MetaFunction = ({ data }) => {
  return [{ title: `Territoire ${data.territory.number} - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [
    Role.TerritoriesViewer,
    Role.TerritoriesManager,
    Role.PublisherViewer,
  ])
  const canViewTerritories = can(Role.TerritoriesViewer)
  const canManageTerritories = can(Role.TerritoriesManager)
  const canViewPublisher = can(Role.PublisherViewer)

  if (!canViewTerritories) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
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
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive)

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

const territoryTypeLabels: Record<string, string> = {
  [TerritoryKind.Classical]: 'Porte à Porte',
  [TerritoryKind.Commerces]: 'Commerces',
  [TerritoryKind.Hotel]: 'Hôtels',
  [TerritoryKind.Phone]: 'Téléphone',
  [TerritoryKind.Univ]: 'Université',
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
          <span className="text-muted-foreground italic">Aucune attribution en cours pour ce territoire</span>
        </div>
        {canManageTerritories && (
          <Button variant="secondary" asChild>
            <Link to={`/territories/attributions/new?territory=${territoryId}`}>Attribuer ce territoire</Link>
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
            <Link to={`/congregation/publishers/${attribution.publisherId}/view`} className="hover:text-primary">
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
              <Link to={`/territories/attributions/${attribution.id}/edit`} title="Voir l'attribution en détail">
                <ExternalLink className="size-4 text-primary" />
              </Link>
            </Button>
            {attribution.endDate == null && (
              <Button variant="ghost" size="icon" asChild className="text-destructive hover:text-destructive">
                <Link to={`/territories/attributions/${attribution.id}/delete`} title="Annuler l'attribution">
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
        title="Aucun historique d'attribution"
        description="Ce territoire n'a pas encore été attribué par le passé."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Proclamateur</TableHead>
            <TableHead className="text-center">Sortie le</TableHead>
            <TableHead className="text-center">Rendu le</TableHead>
            <TableHead className="text-center max-sm:hidden">Durée</TableHead>
            <TableHead className="text-center max-sm:hidden">Type</TableHead>
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
                <TableCell className="text-center">{attribution.startDate.toLocaleDateString('fr-FR')}</TableCell>
                <TableCell className="text-center">{attribution.endDate?.toLocaleDateString('fr-FR')}</TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {durationDays != null ? `${durationDays} jours` : '-'}
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {attribution.type === 'default' && 'Porte à porte'}
                  {attribution.type === 'campaign' && 'Campagne'}
                  {attribution.type === 'phones' && 'Téléphones'}
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
        title={`Territoire ${territory.number}`}
        subtitle="Fiche du territoire"
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
              <Button variant="outline" size="icon" title="Télécharger le territoire en PDF">
                <Download className="size-4" />
              </Button>
            </TerritoryDownloadLink>

            {canManageTerritories && (
              <Button asChild variant="outline" size="icon" title="Modifier le territoire">
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
              <CardTitle>Informations du territoire</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  Numéro : <span className="font-medium text-foreground">{territory.number}</span>
                </p>
                <p className="text-muted-foreground text-sm">
                  Type de territoire :{' '}
                  <span className="font-medium text-foreground">{territoryTypeLabels[territory.type]}</span>
                </p>
                <p className="text-muted-foreground text-sm">
                  {territory.type === TerritoryKind.Phone ? 'Nombre de téléphones' : 'Nombre de foyers'} :{' '}
                  <span className="font-medium text-foreground">{quantity}</span>
                </p>
                {territory.notes.length > 0 && (
                  <p className="text-muted-foreground text-sm">
                    Notes : <span className="font-medium text-foreground">{territory.notes}</span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {territory.type === TerritoryKind.Commerces && territoryEntrances.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Commerces</CardTitle>
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
                          {entrance.buildings[0]?.shopKind || '-'}
                        </span>
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
                <CardTitle>Allées</CardTitle>
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
                          {entrance.homes || entrance.phones} foyers
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <h2 className="font-semibold text-lg">Attribution en cours</h2>
          <CurrentAttributionSection
            attribution={currentAttribution}
            territoryId={territory.id}
            canManageTerritories={canManageTerritories}
            canViewPublisher={canViewPublisher}
          />

          <h2 className="font-semibold text-lg">Historique des attributions</h2>
          <AttributionHistoryTable attributions={pastAttributions} canViewPublisher={canViewPublisher} />
        </div>

        <BuildingEntranceMap apiKey={apiKey} entrances={territory.entrances} />
      </div>
    </div>
  )
}
