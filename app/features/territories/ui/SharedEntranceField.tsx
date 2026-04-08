import { XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import type { Building } from '~/database/generated/client'

import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'

export default function SharedEntranceField({
  building,
  avaibleBuildings,
  onSharedEntranceBuildingsChange = () => {},
}: {
  building: DetailedBuilding
  avaibleBuildings: Building[]
  onSharedEntranceBuildingsChange: (state: boolean) => void
}) {
  const previousBuildings = building.entrance?.buildings ?? []
  const [hasSharedEntrance, setHasSharedEntrance] = useState(previousBuildings.length > 1)
  const [sharedEntranceBuildings, setSharedEntranceBuildings] = useState(previousBuildings)

  const sharedEntranceBuildingsChanged =
    sharedEntranceBuildings.map(b => b.id).join(',') !== previousBuildings.map(b => b.id).join(',')
  useEffect(() => {
    onSharedEntranceBuildingsChange(sharedEntranceBuildingsChanged)
  }, [sharedEntranceBuildingsChanged, onSharedEntranceBuildingsChange])

  return (
    <>
      <div className="flex gap-3">
        <label className="flex grow items-center gap-1 max-sm:gap-3">
          <input
            className="rounded-md border dark:border-gray-300"
            type="checkbox"
            checked={hasSharedEntrance}
            onChange={e => setHasSharedEntrance(e.target.checked)}
            disabled={previousBuildings.length > 1}
          />
          <span>Ce batiment partage son accès avec d'autres batiments</span>
        </label>
      </div>
      {hasSharedEntrance && (
        <div className="flex gap-3">
          <div className="flex flex-col gap-1">
            Batiments liés au même accès :
            <input
              type="hidden"
              name="shared-entrance-buildings"
              value={sharedEntranceBuildings.map(b => b.id).join(',')}
            />
            <div className="flex flex-wrap gap-3">
              {sharedEntranceBuildings.map(building => (
                <button
                  key={building.id}
                  type="button"
                  className="flex items-center gap-1 rounded-md bg-teal-400 px-3 py-1 text-gray-900 text-sm"
                  onClick={() => setSharedEntranceBuildings(sharedEntranceBuildings.filter(b => b.id !== building.id))}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') {
                      return
                    }

                    setSharedEntranceBuildings(sharedEntranceBuildings.filter(b => b.id !== building.id))
                  }}
                >
                  {building.number} {building.street} <XMarkIcon className="inline size-3" />
                </button>
              ))}
              {sharedEntranceBuildings.length === 0 && (
                <span className="flex items-center gap-1 rounded-md border-1 border-gray-400 border-dashed px-3 py-1 text-gray-400 text-sm italic">
                  Aucun batiment
                </span>
              )}
              <select
                className="flex items-center gap-1 rounded-md border-1 border-gray-400 px-3 py-1 text-gray-400 text-sm"
                onChange={e => {
                  const selectedBuilding = avaibleBuildings.find(b => b.id === Number(e.target.value))
                  if (selectedBuilding == null) {
                    return
                  }
                  setSharedEntranceBuildings([...sharedEntranceBuildings, selectedBuilding])
                }}
              >
                <option>Séléctionner un autre batiment</option>
                {avaibleBuildings
                  .filter(streetBuilding => !sharedEntranceBuildings.map(el => el.id).includes(streetBuilding.id))
                  .map(building => (
                    <option key={building.id} value={building.id}>
                      {building.number} {building.street}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
