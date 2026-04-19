import { ExternalLink, Send } from 'lucide-react'
import { data, Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

function getTerritoryTypeLabel(type: string): string {
  const labels: Record<string, () => string> = {
    [TerritoryKind.Classical]: () => m.territories_type_classical(),
    [TerritoryKind.Commerces]: () => m.territories_type_commerces(),
    [TerritoryKind.Phone]: () => m.territories_type_phone(),
    [TerritoryKind.Hotel]: () => m.territories_type_hotel(),
    [TerritoryKind.Univ]: () => m.territories_type_university(),
  }
  return labels[type]?.() ?? type
}

function territoryContentLabel(type: string, entrances: { homes: number | null; phones: number | null }[]): string {
  const count = entrances.length
  if (type === TerritoryKind.Phone) {
    const phones = entrances.reduce((s, e) => s + (e.phones ?? 0), 0)
    return m.territories_content_phones({ count: String(phones) })
  }
  if (type === TerritoryKind.Classical || type === TerritoryKind.Univ) {
    const homes = entrances.reduce((s, e) => s + ((e.homes ?? 0) || (e.phones ?? 0)), 0)
    return homes > 1
      ? m.territories_content_homes_other({ count: String(homes) })
      : m.territories_content_homes_one({ count: String(homes) })
  }
  if (type === TerritoryKind.Commerces) {
    return count > 1
      ? m.territories_content_commerces_other({ count: String(count) })
      : m.territories_content_commerces_one({ count: String(count) })
  }
  if (type === TerritoryKind.Hotel) {
    return count > 1
      ? m.territories_content_hotels_other({ count: String(count) })
      : m.territories_content_hotels_one({ count: String(count) })
  }
  return count > 1
    ? m.territories_content_entrances_other({ count: String(count) })
    : m.territories_content_entrances_one({ count: String(count) })
}

import { getZips } from '~/features/territories/server/buildings.server'
import { findAvailableTerritoriesPaginated } from '~/features/territories/server/territories.server'
import { computeFilters } from '~/features/territories/server/territory-filters.server'
import { checkAvailabilityStatus, TerritoryAvaibilityStatus } from '~/features/territories/ui/TerritoryAvaibilityStatus'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/territories'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.attributions_new_meta_title() }]
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
        <PageHeader title={m.attributions_available_title()} subtitle={m.attributions_available_subtitle()} />
        <TerritoryFilters zips={zips} showAccess showSearch showType showZip />

        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center text-muted-foreground">
          <p>{m.attributions_available_empty_title()}</p>
          <p>{m.attributions_available_empty_details()}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <AlertMessages messages={messages} />
      <PageHeader title={m.attributions_available_title()} subtitle={m.attributions_available_subtitle()} />
      <TerritoryFilters zips={zips} showZip showAccess showSearch showType />

      <div className="flex grow flex-col gap-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">{m.territories_table_number()}</TableHead>
              <TableHead className="w-[150px] text-center">{m.territories_table_type()}</TableHead>
              <TableHead className="w-[150px] text-center">{m.territories_table_content()}</TableHead>
              <TableHead className="w-[150px] text-center">{m.attributions_available_table_status()}</TableHead>
              <TableHead className="w-[150px] text-center" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {territories.map(territory => (
              <TableRow key={territory.id}>
                <TableCell>{territory.number}</TableCell>
                <TableCell className="text-center">{getTerritoryTypeLabel(territory.type)}</TableCell>
                <TableCell className="text-center">
                  {territoryContentLabel(territory.type, territory.entrances)}
                </TableCell>
                <TableCell className="text-center">
                  <TerritoryAvaibilityStatus attribution={[...territory.attributions].shift()} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" asChild>
                      <Link
                        to={`/territories/territory/${territory.id}/view`}
                        title={m.attributions_available_view_title()}
                      >
                        <ExternalLink className="size-4" />
                      </Link>
                    </Button>
                    {checkAvailabilityStatus([...territory.attributions].shift()) ? (
                      <Button variant="ghost" size="sm" asChild className="gap-1.5 text-primary">
                        <Link
                          to={`/territories/attributions/new?territory=${territory.id}`}
                          title={m.attributions_available_assign_title()}
                        >
                          <span className="max-sm:hidden">{m.attributions_available_assign_button()}</span>
                          <Send className="size-4 -rotate-12" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" disabled className="gap-1.5">
                        <span className="max-sm:hidden">{m.attributions_available_assign_button()}</span>
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
