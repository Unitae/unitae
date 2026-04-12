import { ExternalLink, Send } from 'lucide-react'
import { data, Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

const territoryTypeLabels: Record<string, string> = {
  [TerritoryKind.Classical]: 'Porte à porte',
  [TerritoryKind.Commerces]: 'Commerces',
  [TerritoryKind.Phone]: 'Téléphones',
  [TerritoryKind.Hotel]: 'Hôtels',
  [TerritoryKind.Univ]: 'Universités',
}

function territoryContentLabel(type: string, entrances: { homes: number | null; phones: number | null }[]): string {
  const count = entrances.length
  if (type === TerritoryKind.Phone) {
    const phones = entrances.reduce((s, e) => s + (e.phones ?? 0), 0)
    return `${phones} tél.`
  }
  if (type === TerritoryKind.Classical || type === TerritoryKind.Univ) {
    const homes = entrances.reduce((s, e) => s + ((e.homes ?? 0) || (e.phones ?? 0)), 0)
    return `${homes} foyer${homes > 1 ? 's' : ''}`
  }
  if (type === TerritoryKind.Commerces) {
    return `${count} commerce${count > 1 ? 's' : ''}`
  }
  if (type === TerritoryKind.Hotel) {
    return `${count} hôtel${count > 1 ? 's' : ''}`
  }
  return `${count} entrée${count > 1 ? 's' : ''}`
}
import { getZips } from '~/features/territories/server/buildings'
import { findAvailableTerritoriesPaginated } from '~/features/territories/server/territories'
import { computeFilters } from '~/features/territories/server/territory-filters'
import { checkAvailabilityStatus, TerritoryAvaibilityStatus } from '~/features/territories/ui/TerritoryAvaibilityStatus'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/territories'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Attribution d'un territoire - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, session, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.TerritoriesManager,
  ])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    logger.warn(
      `Tried to load territories available for attribution. User ID: ${currentUser.id}. Does NOT have rights to manage territories.`,
    )
    throw redirect('/')
  }

  logger.info(`Loading territories available for attribution. User ID: ${currentUser.id}.`)

  return withScope(congregationId, async db => {
    const url = new URL(request.url)
    const selectors = await computeFilters(url.searchParams)
    selectors.attributions = { none: { endDate: null } }

    const { territories, pagination } = await findAvailableTerritoriesPaginated(db, selectors, url, congregationId)

    const messages = { success: session.get('success'), error: session.get('error') }
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
        canManageTerritories,
      },
      {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      },
    )
  })
}

export default function TerritorySelectorPage({ loaderData }: Route.ComponentProps) {
  const { messages, pagination, territories, zips } = loaderData

  if (territories.length < 1) {
    return (
      <div className="flex flex-col gap-5">
        <AlertMessages messages={messages} />
        <PageHeader title="Territoires disponibles" subtitle="Sélectionnez le territoire à attribuer au proclamateur" />
        <TerritoryFilters zips={zips} showAccess showSearch showType showZip />

        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center text-muted-foreground">
          <p>Il n'y a aucun territoire disponible pour le moment !</p>
          <p>
            Pour ajouter des territoires, utilisez le bouton "Nouveau territoire" sur la page liste des territoires ou
            visitez le module de découpage des territoires sur la page de prospection.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <AlertMessages messages={messages} />
      <PageHeader title="Territoires disponibles" subtitle="Sélectionnez le territoire à attribuer au proclamateur" />
      <TerritoryFilters zips={zips} showZip showAccess showSearch showType />

      <div className="flex grow flex-col gap-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Nº</TableHead>
              <TableHead className="w-[150px] text-center">Type</TableHead>
              <TableHead className="w-[150px] text-center">Contenu</TableHead>
              <TableHead className="w-[150px] text-center">Statut</TableHead>
              <TableHead className="w-[150px] text-center" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {territories.map(territory => (
              <TableRow key={territory.id}>
                <TableCell>{territory.number}</TableCell>
                <TableCell className="text-center">{territoryTypeLabels[territory.type] ?? territory.type}</TableCell>
                <TableCell className="text-center">
                  {territoryContentLabel(territory.type, territory.entrances)}
                </TableCell>
                <TableCell className="text-center">
                  <TerritoryAvaibilityStatus attribution={[...territory.attributions].shift()} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`/territories/territory/${territory.id}/view`} title="Voir le détail du territoire">
                        <ExternalLink className="size-4" />
                      </Link>
                    </Button>
                    {checkAvailabilityStatus([...territory.attributions].shift()) ? (
                      <Button variant="ghost" size="sm" asChild className="gap-1.5 text-primary">
                        <Link
                          to={`/territories/attributions/new?territory=${territory.id}`}
                          title="Atrribuer ce territoire"
                        >
                          <span className="max-sm:hidden">Attribuer</span>
                          <Send className="size-4 -rotate-12" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" disabled className="gap-1.5">
                        <span className="max-sm:hidden">Attribuer</span>
                        <Send className="size-4 -rotate-12" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
      </div>
    </div>
  )
}
