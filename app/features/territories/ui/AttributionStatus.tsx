import type { Attribution } from '~/database/generated/client'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'

interface AttributionPublisherStatus {
  leftAt: Date | null
  anonymizedAt: Date | null
}

export function AttributionStatus({
  attribution,
  publisher,
}: {
  attribution: Attribution
  publisher?: AttributionPublisherStatus
}) {
  // Orphaned takes precedence over Late — fixing the missing holder is more
  // urgent than the date and is what a territories manager needs to scan for.
  if (publisher != null && (publisher.leftAt != null || publisher.anonymizedAt != null)) {
    return (
      <Badge variant="outline" className="border-destructive text-destructive">
        {m.attributions_status_orphaned()}
      </Badge>
    )
  }

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
