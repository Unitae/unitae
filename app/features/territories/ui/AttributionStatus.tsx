import type { Attribution } from '~/database/generated/client'
import { Badge } from '~/shared/ui/badge'

export function AttributionStatus({ attribution }: { attribution: Attribution }) {
  if (attribution.lateDate == null || attribution.lateDate < new Date()) {
    return (
      <Badge variant="outline" className="border-orange-500 text-orange-500">
        en retard
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="border-green-500 text-green-500">
      en cours
    </Badge>
  )
}
