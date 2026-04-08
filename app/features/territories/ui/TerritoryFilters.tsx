import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import { Form, useSearchParams } from 'react-router'
import type { Prisma } from '~/database/generated/client'
import { ShopKind } from '~/features/territories/model/shop-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

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
    <Form className="flex flex-col" action={action}>
      <span className="font-medium text-sm">Filtres :</span>
      <div className="flex flex-wrap gap-3">
        {showZip && (
          <select
            className="inline-block appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
            name="zip"
            defaultValue={params.get('zip') ?? undefined}
          >
            <option value="none">Code Postal</option>
            {zips.map(el => (
              <option key={el.zip} value={el.zip}>
                {el.zip}
              </option>
            ))}
          </select>
        )}
        {showType && (
          <select
            className="inline-block appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
            name="type"
            defaultValue={params.get('type') ?? undefined}
          >
            <option value="none">Type</option>
            <option value={TerritoryKind.Classical}>Porte à Porte</option>
            <option value={TerritoryKind.Commerces}>Commerces</option>
            <option value={TerritoryKind.Hotel}>Hôtels</option>
            <option value={TerritoryKind.Phone}>Téléphones</option>
            <option value={TerritoryKind.Univ}>Université</option>
          </select>
        )}
        {showAccess && (
          <select
            className="inline-block appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
            name="access"
            defaultValue={params.get('access') ?? undefined}
          >
            <option value="none">Accès</option>
            <option value={TerritoryAccess.Code}>Digicode</option>
            <option value={TerritoryAccess.Doorbell}>Sonnette</option>
            <option value={TerritoryAccess.Intercom}>Interphone</option>
          </select>
        )}
        {showShops && (
          <select
            className="inline-block appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
            name="shops"
            defaultValue={params.get('shops') ?? undefined}
          >
            <option value="none">Commerces</option>
            <option value={ShopKind.Food}>Alimentaire</option>
            <option value={ShopKind.Clothing}>Vêtements / Chaussures</option>
            <option value={ShopKind.Jewelry}>Bijoux</option>
            <option value={ShopKind.Health}>Santé / Optique</option>
            <option value={ShopKind.Home}>Maison</option>
            <option value={ShopKind.Catering}>Restaurant / Café / Snack</option>
            <option value={ShopKind.Cosmetics}>Coiffure / Cosmétiques</option>
            <option value={ShopKind.Tech}>Technologie</option>
            <option value={ShopKind.Newspaper}>Tabac / Press</option>
            <option value={ShopKind.GasStation}>Station Services</option>
            <option value={ShopKind.Other}>Autres</option>
          </select>
        )}
        {showSearch && (
          <input
            type="text"
            name="search"
            className="inline-block rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
            placeholder="Recherche"
            defaultValue={params.get('search') ?? undefined}
          />
        )}
        <button
          className="inline-flex appearance-none flex-row items-center justify-center gap-1 rounded-md border border-slate-300 bg-slate-300 px-2 py-1 text-slate-500 shadow-slate-50 hover:border-teal-600 hover:text-teal-600 hover:shadow-lg"
          type="submit"
        >
          <AdjustmentsHorizontalIcon className="size-6 text-teal-600" />
          Filtrer
        </button>
      </div>
    </Form>
  )
}
