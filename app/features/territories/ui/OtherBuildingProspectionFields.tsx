import { useState } from 'react'

import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'
import { ShopKind } from '~/features/territories/model/shop-kind.type'

export default function OtherBuildingProspectionFields({
  isDisabled = false,
  building,
}: {
  building: DetailedBuilding
  isDisabled: boolean
}) {
  const [hasShops, setHasShops] = useState(building.hasShops ?? false)

  const disabledStyle = isDisabled ? 'cursor-not-allowed' : ''
  return (
    <>
      <label className="flex grow items-center gap-1 max-sm:gap-3">
        <input
          className={`rounded-md border dark:border-gray-300 ${disabledStyle}`}
          name="shops"
          type="checkbox"
          checked={hasShops}
          disabled={isDisabled}
          onChange={e => setHasShops(e.target.checked)}
          title={
            isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
          }
        />
        <span>
          Il y a au moins un <span className="font-bold text-teal-600">commerce</span> à cette adresse
        </span>
      </label>
      {hasShops && (
        <label className="flex-1">
          Catégorie de commerce principale
          <select
            className={`h-[34px] w-full appearance-none rounded-md border p-1 dark:border-gray-300 ${disabledStyle}`}
            defaultValue={building.shopKind ?? ''}
            name="shopkinds"
            disabled={isDisabled}
            required
          >
            <option>Sélectionner un type de commerce</option>
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
        </label>
      )}
      <label className="flex grow items-center gap-1 max-sm:gap-3">
        <input
          className={`rounded-md border dark:border-gray-300 ${disabledStyle}`}
          name="campus"
          type="checkbox"
          defaultChecked={building.hasCampus ?? false}
          disabled={isDisabled}
          title={
            isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
          }
        />
        <span>
          Il y a au moins une <span className="font-bold text-teal-600">résidence universitaire</span> à cette adresse
        </span>
      </label>
      <label className="flex grow items-center gap-1 max-sm:gap-3">
        <input
          className={`rounded-md border dark:border-gray-300 ${disabledStyle}`}
          name="hotel"
          type="checkbox"
          defaultChecked={building.hasHotel ?? false}
          disabled={isDisabled}
          title={
            isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
          }
        />
        <span>
          Il y a au moins un <span className="font-bold text-teal-600">hotel</span> à cette adresse
        </span>
      </label>
      <label className="flex grow items-center gap-1 max-sm:gap-3">
        <input
          className={`rounded-md border dark:border-gray-300 ${disabledStyle}`}
          name="landromat"
          type="checkbox"
          defaultChecked={building.hasLandromat ?? false}
          disabled={isDisabled}
          title={
            isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
          }
        />
        <span>
          Il y a au moins une <span className="font-bold text-teal-600">laverie automatique</span> à cette adresse
        </span>
      </label>
      <label className={'flex grow items-center gap-1 max-sm:gap-3'}>
        <input
          className={`rounded-md border dark:border-gray-300 ${disabledStyle}`}
          name="pmr"
          type="checkbox"
          defaultChecked={building.entrance?.isPMR ?? false}
          disabled={isDisabled}
          title={
            isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
          }
        />
        <span>
          Le batiment est{' '}
          <span className="font-bold text-teal-600">accessible pour les Personnes à Mobilité Réduite</span>
        </span>
      </label>
    </>
  )
}
