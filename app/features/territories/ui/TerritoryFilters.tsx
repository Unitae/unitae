import { ArrowUpDown, ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Form, useSearchParams } from 'react-router'
import type { Prisma } from '~/database/generated/client'
import { ShopKind } from '~/features/territories/model/shop-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import type { SortMode } from '~/shared/utils/pagination.server'
import { cn } from '~/shared/utils/utils'
import SearchInputWithHelp from './SearchInputWithHelp'

interface TerritoryFiltersProps {
  action?: string
  zips: (Prisma.PickEnumerable<Prisma.BuildingGroupByOutputType, 'zip'[]> & {})[]
  showType?: boolean
  showAccess?: boolean
  showSearch?: boolean
  showZip?: boolean
  showShops?: boolean
  showSort?: boolean
  sortValue?: SortMode
  sortOptions?: SortMode[]
}

export default function TerritoryFilters({
  action,
  zips,
  showAccess = false,
  showSearch = false,
  showType = false,
  showShops = false,
  showZip = false,
  showSort = false,
  sortValue,
  sortOptions = ['number'],
}: TerritoryFiltersProps) {
  const [params] = useSearchParams()
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const advancedSelects = (
    <>
      {showZip && (
        <Select name="zip" defaultValue={params.get('zip') ?? 'none'}>
          <SelectTrigger className="max-sm:flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{m.territories_filter_zip()}</SelectItem>
            {zips.map(el => (
              <SelectItem key={el.zip} value={el.zip}>
                {el.zip}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {showType && (
        <Select name="type" defaultValue={params.get('type') ?? 'none'}>
          <SelectTrigger className="max-sm:flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{m.territories_filter_type()}</SelectItem>
            <SelectItem value={TerritoryKindKey.Classical}>{m.territories_type_classical_capitalized()}</SelectItem>
            <SelectItem value={TerritoryKindKey.Commerces}>{m.territories_filter_shops()}</SelectItem>
            <SelectItem value={TerritoryKindKey.Hotel}>{m.territories_type_hotel()}</SelectItem>
            <SelectItem value={TerritoryKindKey.Phone}>{m.territories_type_phone()}</SelectItem>
            <SelectItem value={TerritoryKindKey.Univ}>{m.territories_type_university_singular()}</SelectItem>
          </SelectContent>
        </Select>
      )}
      {showAccess && (
        <Select name="access" defaultValue={params.get('access') ?? 'none'}>
          <SelectTrigger className="max-sm:flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{m.territories_filter_access()}</SelectItem>
            <SelectItem value={String(TerritoryAccess.Code)}>{m.territories_filter_access_digicode()}</SelectItem>
            <SelectItem value={String(TerritoryAccess.Doorbell)}>{m.territories_filter_access_doorbell()}</SelectItem>
            <SelectItem value={String(TerritoryAccess.Intercom)}>{m.territories_filter_access_intercom()}</SelectItem>
          </SelectContent>
        </Select>
      )}
      {showShops && (
        <Select name="shops" defaultValue={params.get('shops') ?? 'none'}>
          <SelectTrigger className="max-sm:flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{m.territories_filter_shops()}</SelectItem>
            <SelectItem value={ShopKind.Food}>{m.shop_kind_food()}</SelectItem>
            <SelectItem value={ShopKind.Clothing}>{m.shop_kind_clothing()}</SelectItem>
            <SelectItem value={ShopKind.Jewelry}>{m.shop_kind_jewelry()}</SelectItem>
            <SelectItem value={ShopKind.Health}>{m.shop_kind_health()}</SelectItem>
            <SelectItem value={ShopKind.Home}>{m.shop_kind_home()}</SelectItem>
            <SelectItem value={ShopKind.Catering}>{m.shop_kind_catering()}</SelectItem>
            <SelectItem value={ShopKind.Cosmetics}>{m.shop_kind_cosmetics()}</SelectItem>
            <SelectItem value={ShopKind.Tech}>{m.shop_kind_tech()}</SelectItem>
            <SelectItem value={ShopKind.Newspaper}>{m.shop_kind_newspaper()}</SelectItem>
            <SelectItem value={ShopKind.GasStation}>{m.shop_kind_gas_station()}</SelectItem>
            <SelectItem value={ShopKind.Other}>{m.shop_kind_other()}</SelectItem>
          </SelectContent>
        </Select>
      )}
    </>
  )

  return (
    <Form className="flex flex-col gap-1.5" action={action}>
      <span className="font-medium text-muted-foreground text-sm">{m.territories_filter_label()}</span>
      <div className="flex flex-wrap gap-2">
        {/* Always-visible row: search + sort + submit + (mobile) advanced toggle. */}
        {showSearch && <SearchInputWithHelp defaultValue={params.get('search') ?? undefined} />}
        {showSort && (
          <Select name="sort" defaultValue={sortValue}>
            <SelectTrigger className="gap-1.5 max-sm:flex-1">
              <ArrowUpDown className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder={m.territories_filter_sort_label()} />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.includes('number') && (
                <SelectItem value="number">{m.territories_filter_sort_number()}</SelectItem>
              )}
              {sortOptions.includes('date') && <SelectItem value="date">{m.territories_filter_sort_date()}</SelectItem>}
              {sortOptions.includes('proximity') && (
                <SelectItem value="proximity">{m.territories_filter_sort_proximity()}</SelectItem>
              )}
            </SelectContent>
          </Select>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-between sm:hidden"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen(o => !o)}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="size-4" />
            {m.territories_filter_advanced()}
          </span>
          <ChevronDown className={cn('size-4 transition-transform', advancedOpen && 'rotate-180')} />
        </Button>

        <Button type="submit" variant="outline" size="sm" className="gap-1.5">
          <Search className="size-4" />
          {m.territories_filter_submit()}
        </Button>
      </div>

      {/* Render the advanced Selects only ONCE so Radix doesn't inject
          duplicate hidden form inputs. Visible inline on `sm+`; on mobile
          its visibility is toggled by `advancedOpen`. */}
      <div className={cn('flex flex-wrap gap-2 max-sm:flex-col', !advancedOpen && 'max-sm:hidden')}>
        {advancedSelects}
      </div>
    </Form>
  )
}
