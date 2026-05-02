import { ChevronRight, Download, MapPin } from 'lucide-react'
import { Link } from 'react-router'

import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import {
  getUserTerritoriesWithDetails,
  type TerritoryStatus,
} from '~/features/territories/server/my-territories.server'

import * as m from '~/i18n/paraglide/messages'
import { userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { RelativeTime } from '~/shared/ui/RelativeTime'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.my_territories_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const currentUser = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const territories = await getUserTerritoriesWithDetails(db, currentUser.id)

    return { territories }
  })
}

const statusVariant: Record<TerritoryStatus, 'success' | 'warning' | 'destructive'> = {
  'on-time': 'success',
  'due-soon': 'warning',
  overdue: 'destructive',
}

function statusLabel(status: TerritoryStatus): string {
  if (status === 'on-time') return m.dashboard_territory_on_time()
  if (status === 'due-soon') return m.dashboard_territory_due_soon()
  return m.dashboard_territory_overdue()
}

function territoryTypeLabel(type: string): string {
  if (type === TerritoryKind.Phone) return m.territories_type_phone_singular()
  if (type === TerritoryKind.Commerces) return m.territories_type_commerces()
  if (type === TerritoryKind.Hotel) return m.territories_type_hotel_singular()
  if (type === TerritoryKind.Univ) return m.territories_type_university_singular()
  return m.territories_type_classical()
}

function quantityLabel(type: string, entrances: { homes: number | null; phones: number | null }[]): string {
  if (type === TerritoryKind.Phone) {
    const count = entrances.reduce((acc, e) => acc + (e.phones ?? 0), 0)
    return m.my_territories_phones_count({ count })
  }
  if (type === TerritoryKind.Classical || type === TerritoryKind.Univ) {
    const count = entrances.reduce((acc, e) => acc + ((e.homes ?? 0) || (e.phones ?? 0)), 0)
    return m.my_territories_homes_count({ count })
  }
  if (type === TerritoryKind.Commerces) {
    return m.my_territories_commerces_count({ count: entrances.length })
  }
  return m.my_territories_entrances_count({ count: entrances.length })
}

export default function MyTerritoriesList({ loaderData }: Route.ComponentProps) {
  const { territories } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.my_territories_title()}
        subtitle={m.my_territories_subtitle()}
        breadcrumbs={[{ label: m.sidebar_my_territories() }]}
      />

      {territories.length === 0 ? (
        <EmptyState icon={MapPin} title={m.my_territories_empty()} description={m.my_territories_empty_description()} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {territories.map(t => (
            <Card key={t.id} className="overflow-hidden">
              <CardContent className="flex flex-col gap-3 p-0">
                <Link
                  to={`/me/territories/${t.territory.id}`}
                  className="flex items-center gap-3 px-4 pt-4 pb-0 transition-colors hover:bg-muted/30"
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-lg">
                        {m.territory_doc_title({ name: t.territory.number })}
                      </span>
                      <Badge variant={statusVariant[t.status]} className="text-[10px]">
                        {statusLabel(t.status)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
                      <span>{territoryTypeLabel(t.territory.type)}</span>
                      <span>·</span>
                      <span>{quantityLabel(t.territory.type, t.territory.entrances)}</span>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      <RelativeTime date={t.lateDate} />
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" />
                </Link>

                <div className="border-t px-4 py-2.5">
                  <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                    <a href={`/territories/territory/${t.territory.id}/pdf`}>
                      <Download className="size-3.5" />
                      {m.my_territories_download_pdf()}
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
