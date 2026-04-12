import { useState } from 'react'
import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

export default function BuildingProspectionForDoorToDoorFields({
  isDisabled = false,
  building,
}: {
  building: DetailedBuilding
  isDisabled: boolean
}) {
  const residentialEntrance = building.entrances.find(e => e.kind === 'residential')
  const residentialData = building.residentialData
  const [access, setAccess] = useState(residentialEntrance?.access)
  const disabledStyled = isDisabled ? 'cursor-not-allowed opacity-50' : ''

  return (
    <>
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label>Type de d'accès</Label>
          <select
            className={`rounded-md border border-input bg-background px-3 py-2 text-sm ${disabledStyled}`}
            defaultValue={residentialEntrance?.access ?? ''}
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
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label>Nombre de logements</Label>
          <Input
            defaultValue={residentialData?.homes ?? ''}
            name="homes"
            type="number"
            disabled={isDisabled}
            className={disabledStyled}
          />
        </div>
      </div>
      {access === TerritoryAccess.Code && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              className={`rounded border border-input ${disabledStyled}`}
              name="doors"
              type="checkbox"
              defaultChecked={residentialEntrance?.isOpenEarly ?? false}
              disabled={isDisabled}
              title={
                isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
              }
            />
            Les portes sont ouvertes le matin
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              className={`rounded border border-input ${disabledStyled}`}
              name="mailboxes"
              type="checkbox"
              defaultChecked={residentialEntrance?.isMailboxOpen ?? false}
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
        <div className="flex flex-1 flex-col gap-1.5">
          <Label>Nombre de téléphones</Label>
          <Input
            defaultValue={residentialData?.phones ?? ''}
            name="phones"
            type="number"
            disabled={isDisabled}
            className={disabledStyled}
            title={
              isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
            }
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label>Nombre de libéraux</Label>
          <Input
            defaultValue={residentialData?.liberals ?? ''}
            name="liberals"
            type="number"
            disabled={isDisabled}
            className={disabledStyled}
            title={
              isDisabled ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer' : ''
            }
          />
        </div>
      </div>
    </>
  )
}
