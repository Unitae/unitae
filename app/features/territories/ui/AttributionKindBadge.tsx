import { Megaphone, Phone } from 'lucide-react'

import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'

type Props = {
  type: TerritoryAttributionKind
  className?: string
}

export function AttributionKindBadge({ type, className }: Props) {
  if (type === TerritoryAttributionKind.Phone) {
    return (
      <Badge variant="secondary" className={className}>
        <Phone />
        {m.attributions_type_phone()}
      </Badge>
    )
  }

  if (type === TerritoryAttributionKind.Campaign) {
    return (
      <Badge variant="secondary" className={className}>
        <Megaphone />
        {m.attributions_type_campaign()}
      </Badge>
    )
  }

  return null
}
