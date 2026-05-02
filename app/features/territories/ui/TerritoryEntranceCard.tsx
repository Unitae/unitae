import { DoorOpen, Phone, Store } from 'lucide-react'
import { formatAccessSequence } from '~/features/territories/model/access-format'
import { shopKindLabels as getShopKindLabels, type ShopKind } from '~/features/territories/model/shop-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import type { Entrance } from '~/shared/types/entrance'
import { Card, CardContent } from '~/shared/ui/card'

interface TerritoryEntranceCardProps {
  entrance: Entrance
  territoryType: string
  showPhone?: boolean
}

export function TerritoryEntranceCard({ entrance, territoryType, showPhone = false }: TerritoryEntranceCardProps) {
  const firstBuilding = entrance.buildings[0]
  if (!firstBuilding) return null

  const numbers = entrance.buildings.map(b => b.number).join(', ')
  const address = `${numbers} ${firstBuilding.street}, ${firstBuilding.zip}`

  if (territoryType === TerritoryKind.Commerces) {
    return <CommerceCard address={address} entrance={entrance} />
  }

  return <ResidentialCard address={address} entrance={entrance} territoryType={territoryType} showPhone={showPhone} />
}

function ResidentialCard({
  address,
  entrance,
  territoryType,
  showPhone,
}: {
  address: string
  entrance: Entrance
  territoryType: string
  showPhone: boolean
}) {
  const accessText = formatAccessSequence(entrance)
  const hasCode =
    (entrance.accesses ?? []).some(a => a.type === TerritoryAccess.Code) || entrance.access === TerritoryAccess.Code
  const phones = entrance.phones ?? 0
  const homes = entrance.homes ?? 0
  const isPhoneTerritory = territoryType === TerritoryKind.Phone

  return (
    <Card>
      <CardContent className="flex gap-3 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          {isPhoneTerritory ? <Phone className="size-4 text-primary" /> : <DoorOpen className="size-4 text-primary" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-medium text-sm">{address}</p>
          {accessText.length > 0 && <p className="text-muted-foreground text-xs">{accessText}</p>}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
            {hasCode && entrance.isOpenEarly === true && <span>{m.territory_doc_open_morning()}</span>}
            {hasCode && entrance.isMailboxOpen === true && <span>{m.territory_doc_mailbox_accessible()}</span>}
            {isPhoneTerritory && phones > 0 && <span>{m.territory_doc_phone_abbr({ count: phones })}</span>}
            {!isPhoneTerritory && homes > 0 && <span>{m.my_territories_homes_count({ count: homes })}</span>}
            {!isPhoneTerritory && showPhone && phones > 0 && (
              <span>{m.territory_doc_phone_abbr({ count: phones })}</span>
            )}
          </div>
          {entrance.notes.length > 0 && <p className="mt-0.5 text-destructive text-xs italic">{entrance.notes}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function CommerceCard({ address, entrance }: { address: string; entrance: Entrance }) {
  const shopLabel = getShopKindLabels()[entrance.shopKind as ShopKind] ?? m.territory_doc_shop_fallback()

  return (
    <Card>
      <CardContent className="flex gap-3 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
          <Store className="size-4 text-amber-700 dark:text-amber-400" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-medium text-sm">{address}</p>
          <p className="text-muted-foreground text-xs">{shopLabel}</p>
          {entrance.notes.length > 0 && <p className="mt-0.5 text-destructive text-xs italic">{entrance.notes}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
