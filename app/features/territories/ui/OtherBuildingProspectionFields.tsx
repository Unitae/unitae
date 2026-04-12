import { useState } from 'react'

import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'
import { ShopKind } from '~/features/territories/model/shop-kind.type'
import { Label } from '~/shared/ui/label'

export default function OtherBuildingProspectionFields({
  isDisabled = false,
  building,
}: {
  building: DetailedBuilding
  isDisabled: boolean
}) {
  const [hasShops, setHasShops] = useState(building.hasShops ?? false)

  const disabledStyle = isDisabled ? 'cursor-not-allowed opacity-50' : ''
  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <input
          className={`rounded border border-input ${disabledStyle}`}
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
          Il y a au moins un <span className="font-semibold text-primary">commerce</span> à cette adresse
        </span>
      </label>
      {hasShops && (
        <div className="flex flex-col gap-1.5">
          <Label>Catégorie de commerce principale</Label>
          <select
            className={`rounded-md border border-input bg-background px-3 py-2 text-sm ${disabledStyle}`}
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
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          className={`rounded border border-input ${disabledStyle}`}
          name="campus"
          type="checkbox"
          defaultChecked={building.hasCampus ?? false}
          disabled={isDisabled}
          title={
            isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
          }
        />
        <span>
          Il y a au moins une <span className="font-semibold text-primary">résidence universitaire</span> à cette
          adresse
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          className={`rounded border border-input ${disabledStyle}`}
          name="hotel"
          type="checkbox"
          defaultChecked={building.hasHotel ?? false}
          disabled={isDisabled}
          title={
            isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
          }
        />
        <span>
          Il y a au moins un <span className="font-semibold text-primary">hotel</span> à cette adresse
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          className={`rounded border border-input ${disabledStyle}`}
          name="landromat"
          type="checkbox"
          defaultChecked={building.hasLandromat ?? false}
          disabled={isDisabled}
          title={
            isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
          }
        />
        <span>
          Il y a au moins une <span className="font-semibold text-primary">laverie automatique</span> à cette adresse
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          className={`rounded border border-input ${disabledStyle}`}
          name="pmr"
          type="checkbox"
          defaultChecked={building.entrances.find(e => e.kind === 'residential')?.isPMR ?? false}
          disabled={isDisabled}
          title={
            isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
          }
        />
        <span>
          Le batiment est{' '}
          <span className="font-semibold text-primary">accessible pour les Personnes à Mobilité Réduite</span>
        </span>
      </label>
    </>
  )
}
