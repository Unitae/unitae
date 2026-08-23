import { Megaphone, Phone } from 'lucide-react'

import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'

type AttributionKindBadgeProps = {
  type: TerritoryAttributionKind
  /** Campaign the attribution belongs to, if any — shows the campaign badge. */
  campaignName?: string | null
  className?: string
}

/**
 * Method and campaign are orthogonal layers: a campaign attribution worked by
 * phone shows both badges.
 */
export function AttributionKindBadge({ type, campaignName, className }: AttributionKindBadgeProps) {
  const phoneBadge =
    type === TerritoryAttributionKind.Phone ? (
      <Badge variant="secondary" className={className}>
        <Phone />
        {m.attributions_type_phone()}
      </Badge>
    ) : null

  const campaignBadge =
    campaignName != null ? (
      <Badge variant="secondary" className={`max-w-xs truncate ${className ?? ''}`}>
        <Megaphone />
        {campaignName.length > 0 ? campaignName : m.attributions_type_campaign()}
      </Badge>
    ) : null

  if (phoneBadge == null && campaignBadge == null) return null

  return (
    <>
      {campaignBadge}
      {phoneBadge}
    </>
  )
}
