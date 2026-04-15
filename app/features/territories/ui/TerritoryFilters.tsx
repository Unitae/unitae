import { SlidersHorizontal } from 'lucide-react'
import { Form, useSearchParams } from 'react-router'
import type { Prisma } from '~/database/generated/client'
import { ShopKind } from '~/features/territories/model/shop-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import * as m from '~/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'

interface TerritoryFiltersProps {
  action?: string
  zips: (Prisma.PickEnumerable<Prisma.BuildingGroupByOutputType, 'zip'[]> & {})[]
  showType?: boolean
  showAccess?: boolean
  showSearch?: boolean
  showZip?: boolean
  showShops?: boolean
}

export default function TerritoryFilters({
  action,
  zips,
  showAccess = false,
  showSearch = false,
  showType = false,
  showShops = false,
  showZip = false,
}: TerritoryFiltersProps) {
  const [params] = useSearchParams()

  return (
    <Form className="flex flex-col gap-1.5" action={action}>
      <span className="font-medium text-muted-foreground text-sm">{m.territories_filter_label()}</span>
      <div className="flex flex-wrap gap-2">
        {showZip && (
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm max-sm:flex-1"
            name="zip"
            defaultValue={params.get('zip') ?? undefined}
          >
            <option value="none">{m.territories_filter_zip()}</option>
            {zips.map(el => (
              <option key={el.zip} value={el.zip}>
                {el.zip}
              </option>
            ))}
          </select>
        )}
        {showType && (
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm max-sm:flex-1"
            name="type"
            defaultValue={params.get('type') ?? undefined}
          >
            <option value="none">{m.territories_filter_type()}</option>
            <option value={TerritoryKind.Classical}>{m.territories_type_classical_capitalized()}</option>
            <option value={TerritoryKind.Commerces}>{m.territories_filter_shops()}</option>
            <option value={TerritoryKind.Hotel}>{m.territories_type_hotel()}</option>
            <option value={TerritoryKind.Phone}>{m.territories_type_phone()}</option>
            <option value={TerritoryKind.Univ}>{m.territories_type_university_singular()}</option>
          </select>
        )}
        {showAccess && (
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm max-sm:flex-1"
            name="access"
            defaultValue={params.get('access') ?? undefined}
          >
            <option value="none">{m.territories_filter_access()}</option>
            <option value={TerritoryAccess.Code}>{m.territories_filter_access_digicode()}</option>
            <option value={TerritoryAccess.Doorbell}>{m.territories_filter_access_doorbell()}</option>
            <option value={TerritoryAccess.Intercom}>{m.territories_filter_access_intercom()}</option>
          </select>
        )}
        {showShops && (
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm max-sm:flex-1"
            name="shops"
            defaultValue={params.get('shops') ?? undefined}
          >
            <option value="none">{m.territories_filter_shops()}</option>
            <option value={ShopKind.Food}>{m.shop_kind_food()}</option>
            <option value={ShopKind.Clothing}>{m.shop_kind_clothing()}</option>
            <option value={ShopKind.Jewelry}>{m.shop_kind_jewelry()}</option>
            <option value={ShopKind.Health}>{m.shop_kind_health()}</option>
            <option value={ShopKind.Home}>{m.shop_kind_home()}</option>
            <option value={ShopKind.Catering}>{m.shop_kind_catering()}</option>
            <option value={ShopKind.Cosmetics}>{m.shop_kind_cosmetics()}</option>
            <option value={ShopKind.Tech}>{m.shop_kind_tech()}</option>
            <option value={ShopKind.Newspaper}>{m.shop_kind_newspaper()}</option>
            <option value={ShopKind.GasStation}>{m.shop_kind_gas_station()}</option>
            <option value={ShopKind.Other}>{m.shop_kind_other()}</option>
          </select>
        )}
        {showSearch && (
          <Input
            type="text"
            name="search"
            className="w-auto max-sm:flex-1"
            placeholder={m.territories_filter_search()}
            defaultValue={params.get('search') ?? undefined}
          />
        )}
        <Button type="submit" variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal className="size-4" />
          {m.territories_filter_submit()}
        </Button>
      </div>
    </Form>
  )
}
