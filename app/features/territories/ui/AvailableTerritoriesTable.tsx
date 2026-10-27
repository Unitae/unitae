import { ExternalLink, Send } from 'lucide-react'
import React from 'react'
import { Link } from 'react-router'
import type { Attribution, BuildingEntrance, Territory } from '~/database/generated/client'
import { territoryTypeLabels } from '~/features/territories/model/territory-kind.type'
import { territoryContentLabel } from '~/features/territories/server/territory-content-label'
import { NoCoordinatesDivider } from '~/features/territories/ui/NoCoordinatesNotice'
import { PmrStatusBadge } from '~/features/territories/ui/PmrStatusBadge'
import { checkAvailabilityStatus, TerritoryAvaibilityStatus } from '~/features/territories/ui/TerritoryAvaibilityStatus'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

type AvailableTerritory = Pick<Territory, 'id' | 'number' | 'type'> & {
  entrances: Pick<BuildingEntrance, 'homes' | 'phones' | 'kind' | 'isPMR'>[]
  attributions: (Attribution & { campaign: { restPeriodDays: number | null } | null })[]
}

interface AvailableTerritoriesTableProps {
  territories: AvailableTerritory[]
  campaignMode: boolean
  proximityActive: boolean
  distances: Record<number, string | null>
  withoutCoordsCount: number
  pmrActive: boolean
}

export function AvailableTerritoriesTable({
  territories,
  campaignMode,
  proximityActive,
  distances,
  withoutCoordsCount,
  pmrActive,
}: AvailableTerritoriesTableProps) {
  const dividerIndex = proximityActive ? territories.findIndex(t => distances[t.id] == null) : -1
  const baseCol = 5
  const colSpan = baseCol + (proximityActive ? 1 : 0) + (pmrActive ? 1 : 0)

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[150px]">{m.territories_table_number()}</TableHead>
          {proximityActive && (
            <TableHead className="w-[120px] text-right">{m.territories_filter_distance_header()}</TableHead>
          )}
          <TableHead className="w-[150px] text-center max-sm:hidden">{m.territories_table_type()}</TableHead>
          <TableHead className="w-[150px] text-center max-sm:hidden">{m.territories_table_content()}</TableHead>
          {pmrActive && (
            <TableHead className="w-[150px] text-center max-sm:hidden">{m.territories_table_pmr()}</TableHead>
          )}
          <TableHead className="w-[150px] text-center">{m.attributions_available_table_status()}</TableHead>
          <TableHead className="w-[150px] text-center" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {territories.map((territory, index) => {
          const distance = distances[territory.id]
          const showDivider = proximityActive && dividerIndex === index && index > 0
          const lastAttribution = [...territory.attributions].shift()
          return (
            <React.Fragment key={territory.id}>
              {showDivider && <NoCoordinatesDivider count={withoutCoordsCount} colSpan={colSpan} />}
              <TableRow>
                <TableCell>{territory.number}</TableCell>
                {proximityActive && (
                  <TableCell className="text-right tabular-nums text-foreground/80">
                    <span title={distance == null ? m.territories_filter_distance_unknown_tooltip() : undefined}>
                      {distance ?? '—'}
                    </span>
                  </TableCell>
                )}
                <TableCell className="text-center max-sm:hidden">{territoryTypeLabels()[territory.type]}</TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {territoryContentLabel(territory.type, territory.entrances)}
                </TableCell>
                {pmrActive && (
                  <TableCell className="text-center max-sm:hidden">
                    <PmrStatusBadge type={territory.type} entrances={territory.entrances} />
                  </TableCell>
                )}
                <TableCell className="text-center">
                  <TerritoryAvaibilityStatus attribution={lastAttribution} campaignMode={campaignMode} />
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
                    {checkAvailabilityStatus(lastAttribution, campaignMode) ? (
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
            </React.Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}
