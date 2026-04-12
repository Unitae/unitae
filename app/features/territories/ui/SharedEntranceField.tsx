import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Building } from '~/database/generated/client'

import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'
import { Badge } from '~/shared/ui/badge'
import { Label } from '~/shared/ui/label'

export default function SharedEntranceField({
  building,
  avaibleBuildings,
  onSharedEntranceBuildingsChange = () => {},
}: {
  building: DetailedBuilding
  avaibleBuildings: Building[]
  onSharedEntranceBuildingsChange: (state: boolean) => void
}) {
  const residentialEntrance = building.entrances.find(e => e.kind === 'residential')
  const previousBuildings = residentialEntrance?.buildings ?? []
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
        <label className="flex items-center gap-2 text-sm">
          <input
            className="rounded border border-input"
            type="checkbox"
            checked={hasSharedEntrance}
            onChange={e => setHasSharedEntrance(e.target.checked)}
            disabled={previousBuildings.length > 1}
          />
          <span>Ce batiment partage son accès avec d'autres batiments</span>
        </label>
      </div>
      {hasSharedEntrance && (
        <div className="flex flex-col gap-2">
          <Label>Batiments liés au même accès :</Label>
          <input
            type="hidden"
            name="shared-entrance-buildings"
            value={sharedEntranceBuildings.map(b => b.id).join(',')}
          />
          <div className="flex flex-wrap gap-2">
            {sharedEntranceBuildings.map(building => (
              <Badge
                key={building.id}
                variant="secondary"
                className="cursor-pointer gap-1"
                onClick={() => setSharedEntranceBuildings(sharedEntranceBuildings.filter(b => b.id !== building.id))}
              >
                {building.number} {building.street} <X className="size-3" />
              </Badge>
            ))}
            {sharedEntranceBuildings.length === 0 && (
              <span className="rounded-md border border-muted-foreground border-dashed px-3 py-1 text-muted-foreground text-sm italic">
                Aucun batiment
              </span>
            )}
            <select
              className="rounded-md border border-input bg-background px-3 py-1 text-sm"
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
      )}
    </>
  )
}
