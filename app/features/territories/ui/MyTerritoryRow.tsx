import { Tag } from '@unitae/ui'
import { Download } from 'lucide-react'
import { Link } from 'react-router'

import { type HolderLoan, LoanBar, LoanStatus } from '~/features/territories/ui/HolderLoan'
import {
  territoryEntrancesLabel,
  territoryKindLabel,
  territoryQuantityLabel,
} from '~/features/territories/ui/my-territory-labels'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'

export interface MyTerritoryRowData extends HolderLoan {
  territoryId: number
  number: string
  type: string
  homes: number
  phones: number
  entrances: number
  /** The streets naming it, the busiest first, and how many more it covers. */
  streets: string[]
  moreStreets: number
  byPhone: boolean
  /** The campaign it was attributed for; an empty string for one without a name. */
  campaignName: string | null
}

/**
 * One of the holder's territories: its streets, what there is to visit, how much of the loan has
 * gone and when it is due back. The PDF sits beside the row rather than inside its link.
 */
export function MyTerritoryRow({ territory, timeZone }: { territory: MyTerritoryRowData; timeZone: string }) {
  const paused = territory.pausedAt != null
  const streets = territory.streets.join(', ')

  return (
    <li className="flex items-start gap-1 border-border border-b pr-1 transition-colors duration-(--u-duration-fast) last:border-b-0 hover:bg-hover md:items-center md:gap-2 md:pr-3">
      <Link
        to={`/me/territories/${territory.territoryId}`}
        className="grid min-w-0 flex-1 grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 gap-y-2 py-3 pl-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:grid-cols-[3.5rem_minmax(0,1fr)_15rem] md:items-center md:gap-x-5 md:pl-4"
      >
        <span className={cn('pt-px font-semibold tabular-nums md:pt-0', paused && 'text-muted-foreground')}>
          {territory.number}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          {streets !== '' && (
            <span className={cn('font-medium md:truncate', paused && 'text-muted-foreground')}>
              {streets}
              {territory.moreStreets > 0 && (
                <span className="font-normal text-faint">
                  {m.my_territories_more_streets({ count: territory.moreStreets })}
                </span>
              )}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-faint text-sm">
            <span className="tabular-nums">
              {[
                territoryKindLabel(territory.type),
                territoryQuantityLabel(territory.type, territory),
                territoryEntrancesLabel(territory.type, territory.entrances),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {territory.campaignName != null && <Tag>{territory.campaignName || m.attributions_type_campaign()}</Tag>}
            {territory.byPhone && <Tag>{m.attributions_type_phone()}</Tag>}
          </span>
        </span>
        <span className="col-start-2 flex flex-col gap-1.5 md:col-start-3">
          <LoanBar loan={territory} />
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <LoanStatus loan={territory} timeZone={timeZone} />
          </span>
        </span>
      </Link>
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="mt-1.5 text-muted-foreground max-md:size-11 max-md:px-0 md:mt-0"
      >
        <a
          href={`/territories/territory/${territory.territoryId}/pdf`}
          aria-label={m.my_territories_download_pdf_of({ number: territory.number })}
        >
          <Download aria-hidden="true" />
          <span className="max-md:sr-only">{m.my_territories_pdf_short()}</span>
        </a>
      </Button>
    </li>
  )
}
