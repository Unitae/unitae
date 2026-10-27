import { Accessibility } from 'lucide-react'
import { getTerritoryPmrStatus, pmrStatusLabels } from '~/features/territories/model/pmr-status'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { Badge } from '~/shared/ui/badge'

// Not PMR is a fact, not an error — grey, never red.
const variants = { full: 'success', partial: 'warning', not: 'secondary' } as const

interface PmrStatusBadgeProps {
  type: TerritoryKindKey
  entrances: Parameters<typeof getTerritoryPmrStatus>[1]
}

/** "—" when the territory has no PMR status. */
export function PmrStatusBadge({ type, entrances }: PmrStatusBadgeProps) {
  const status = getTerritoryPmrStatus(type, entrances)
  if (status == null) return <span className="text-muted-foreground">—</span>

  return (
    <Badge variant={variants[status]}>
      <Accessibility />
      {pmrStatusLabels()[status]}
    </Badge>
  )
}
