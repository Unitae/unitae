import { Status } from '@unitae/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import type { AttributionState } from '~/features/territories/model/attribution-list'
import { type PmrStatus, pmrStatusLabels } from '~/features/territories/model/pmr-status'
import type { Availability } from '~/features/territories/model/territory-availability'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { TerritoryHistoryEntry } from '~/features/territories/server/territory-page.queries'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

import { availabilityLabel, dueText, holderName, STATE_TONE } from './attribution-labels'
import { territoryKindLabel, territoryQuantityLabel } from './my-territory-labels'

/** « En retard depuis le 13 sept. · chez Valérie RICHARD », or whether it can go out. */
export function TerritoryStandingStatus({
  current,
  availability,
  today,
}: {
  current: (TerritoryHistoryEntry & { state: AttributionState }) | null
  availability: Availability
  today: string
}) {
  if (current == null) return <Status tone="neutral">{availabilityLabel(availability, today)}</Status>
  return (
    <Status tone={STATE_TONE[current.state]}>
      {m.territory_page_status_held({ due: dueText(current, today), name: holderName(current.publisher) })}
    </Status>
  )
}

/** « Porte à porte · 139 foyers · 7 entrées · 3 rues · PMR partiel · attribué 6 fois ». */
export function TerritoryFacts({
  type,
  totals,
  pmr,
  attributed,
}: {
  type: TerritoryKindKey
  totals: { homes: number; phones: number; entrances: number; streets: number }
  pmr: PmrStatus | null
  /** How many times it was attributed; 0 says nothing. */
  attributed: number
}) {
  const facts = [
    territoryKindLabel(type),
    territoryQuantityLabel(type, totals),
    m.territory_page_entrances_streets({ entrances: totals.entrances, streets: totals.streets }),
    pmr != null && pmr !== 'not' ? pmrStatusLabels()[pmr] : null,
    attributed > 0 ? m.territory_page_attributed_times({ count: attributed }) : null,
  ].filter((fact): fact is string => fact != null)
  return (
    <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-muted-foreground text-sm tabular-nums">
      {facts.map(fact => (
        <span key={fact}>{fact}</span>
      ))}
    </span>
  )
}

/** The previous or next territory of the same kind, in the top bar. */
export function NeighbourLink({
  to,
  query,
  label,
  icon,
}: {
  to: { id: number; number: string } | null
  query: string
  label: (input: { number: string }) => string
  icon: ReactNode
}) {
  if (to == null) return null
  return (
    <Button asChild variant="ghost" size="icon-sm" title={label({ number: to.number })}>
      <Link to={`/territories/territory/${to.id}/view${query}`} aria-label={label({ number: to.number })}>
        {icon}
      </Link>
    </Button>
  )
}
