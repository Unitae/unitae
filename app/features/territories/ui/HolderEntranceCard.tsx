import { X } from 'lucide-react'

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
 * The entrance picked on the map: what the list says of it, without leaving the map. Docked in the map's
 * corner on a wide screen, across its width on a phone; on both, above the map's attribution, which must
 * stay visible.
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
    <section
      aria-label={title}
      className="absolute bottom-7 z-10 flex animate-fade-in-up flex-col gap-2 rounded-lg bg-surface px-3.5 pt-3 pb-3.5 shadow-lg ring-1 ring-border max-xl:inset-x-2 xl:right-3 xl:w-75"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
          <span className="font-semibold tabular-nums">{title}</span>
          {facts.length > 0 && <span className="text-faint text-sm tabular-nums">{facts.join(' · ')}</span>}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground max-xl:size-11"
          aria-label={m.my_territories_card_close()}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      {lead !== '' && <span>{lead}</span>}
      {entrance.notes !== '' && <EntranceNote notes={entrance.notes} />}
      <Button variant="outline" size="sm" className="self-start max-xl:h-11 max-xl:self-stretch" onClick={onShowInList}>
        {m.my_territories_show_in_list()}
      </Button>
    </section>
  )
}
