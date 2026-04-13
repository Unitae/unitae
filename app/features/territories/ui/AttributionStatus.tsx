import type { Attribution } from '~/database/generated/client'
import * as m from '~/paraglide/messages'
import { Badge } from '~/shared/ui/badge'

export function AttributionStatus({ attribution }: { attribution: Attribution }) {
  if (attribution.lateDate == null || attribution.lateDate < new Date()) {
    return (
      <Badge variant="outline" className="border-orange-500 text-orange-500">
        {m.attributions_status_late()}
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="border-green-500 text-green-500">
      {m.attributions_status_current()}
    </Badge>
  )
}
