import { useState } from 'react'
import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'

export default function BuildingProspectionForDoorToDoorFields({
  isDisabled = false,
  building,
}: {
  building: DetailedBuilding
  isDisabled: boolean
}) {
  const [access, setAccess] = useState(building.entrance?.access)
  const disabledStyled = isDisabled ? 'cursor-not-allowed' : ''

  return (
    <>
      <div className="flex gap-3">
        <label className="flex-1">
          Type de d'accès
          <select
            className={`h-[34px] w-full appearance-none rounded-md border p-1 dark:border-gray-300 ${disabledStyled}`}
            defaultValue={building.entrance?.access ?? ''}
            name="access"
            value={access ?? ''}
            onChange={e => setAccess(Number(e.target.value))}
            disabled={isDisabled}
          >
            <option>Sélectionner un type d'accès</option>
            <option value={TerritoryAccess.Intercom}>Interphone</option>
            <option value={TerritoryAccess.Code}>Digicode</option>
            <option value={TerritoryAccess.Doorbell}>Sonnette extérieur</option>
          </select>
        </label>
        <label className="flex-1">
          Nombre de logements
          <input
            className={`h-[34px] w-full rounded-md border p-1 dark:border-gray-300 ${disabledStyled}`}
            defaultValue={building.homes ?? ''}
            name="homes"
            type="number"
            disabled={isDisabled}
          />
        </label>
      </div>
      {access === TerritoryAccess.Code && (
        <>
          <label className="flex grow items-center gap-1">
            <input
              className={`rounded-md border dark:border-gray-300 ${disabledStyled}`}
              name="doors"
              type="checkbox"
              defaultChecked={building.entrance?.isOpenEarly ?? false}
              disabled={isDisabled}
              title={
                isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
              }
            />
            Les portes sont ouvertes le matin
          </label>
          <label className="flex grow items-center gap-1">
            <input
              className={`rounded-md border dark:border-gray-300 ${disabledStyled}`}
              name="mailboxes"
              type="checkbox"
              defaultChecked={building.entrance?.isMailboxOpen ?? false}
              disabled={isDisabled}
              title={
                isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
              }
            />
            Les boites aux lettres sont accessibles
          </label>
        </>
      )}
      <div className="flex gap-3">
        <label className="flex-1">
          Nombre de téléphones
          <input
            className={`h-[34px] w-full rounded-md border p-1 dark:border-gray-300 ${isDisabled ? 'cursor-not-allowed' : ''}`}
            defaultValue={building.phones ?? ''}
            name="phones"
            type="number"
            disabled={isDisabled}
            title={
              isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
            }
          />
        </label>
        <label className="flex-1">
          Nombre de libéraux
          <input
            className={`h-[34px] w-full rounded-md border p-1 dark:border-gray-300 ${isDisabled ? 'cursor-not-allowed' : ''}`}
            defaultValue={building.liberals ?? ''}
            name="liberals"
            type="number"
            disabled={isDisabled}
            title={
              isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
            }
          />
        </label>
      </div>
    </>
  )
}
