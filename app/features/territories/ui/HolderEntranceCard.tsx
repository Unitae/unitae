import { MapCard } from '@unitae/ui'

import type { HolderEntrance } from '~/features/territories/model/holder-territory'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { EntranceNote, entranceFacts, shopKindLabel } from '~/features/territories/ui/HolderEntranceList'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

interface HolderEntranceCardProps {
  entrance: HolderEntrance
  territoryType: string
  showPhone: boolean
  onClose: () => void
  onShowInList: () => void
}

/**
 * The entrance picked on the map: what the list says of it, without leaving the map. The design system's map card:
 * in the map's corner on a wide screen, across its width on a phone, above the attribution, closed by Escape.
 */
export function HolderEntranceCard({
  entrance,
  territoryType,
  showPhone,
  onClose,
  onShowInList,
}: HolderEntranceCardProps) {
  const isShops = territoryType === TerritoryKindKey.Commerces
  const lead = isShops ? m.my_territories_shop() : entrance.access
  const facts = isShops ? [shopKindLabel(entrance)] : entranceFacts(entrance, territoryType, showPhone)
  const title = `${entrance.numbers.join(', ')} ${entrance.street}`

  return (
    <MapCard
      title={title}
      meta={facts.length > 0 ? facts.join(' · ') : undefined}
      onClose={onClose}
      closeLabel={m.my_territories_card_close()}
      className="animate-fade-in-up"
    >
      {lead !== '' && <span>{lead}</span>}
      {entrance.notes !== '' && <EntranceNote notes={entrance.notes} />}
      <Button variant="outline" size="sm" className="self-start max-xl:h-11 max-xl:self-stretch" onClick={onShowInList}>
        {m.my_territories_show_in_list()}
      </Button>
    </MapCard>
  )
}
