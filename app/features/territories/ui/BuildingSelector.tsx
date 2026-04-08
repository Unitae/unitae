import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { AggregatedEntrance } from '~/shared/types/entrance'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'

export default function BuildingSelector({
  zips = [],
  streets = [],
  entrances = [],
  selection = [],
  onSelectionChange = () => {},
}: {
  zips: { zip: string }[]
  streets: { street: string }[]
  entrances: AggregatedEntrance[]
  selection: AggregatedEntrance[]
  onSelectionChange: (selection: AggregatedEntrance[]) => void
}) {
  const [shouldShowSearchBox, showSearchBox] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedEntrance, selectEntrance] = useState<number | null>(null)

  if (shouldShowSearchBox) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>Code postal</Label>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                onChange={event => {
                  searchParams.set('zip', event.target.value)
                  setSearchParams(searchParams)
                }}
                defaultValue={searchParams.get('zip') ?? ''}
              >
                <option disabled selected={!searchParams.has('zip')}>
                  Sélectionner un code postal
                </option>
                {zips.map(el => (
                  <option key={el.zip} value={el.zip}>
                    {el.zip}
                  </option>
                ))}
              </select>
            </div>
            {streets.length > 0 && (
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Voie</Label>
                <select
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  onChange={event => {
                    searchParams.set('street', event.target.value)
                    setSearchParams(searchParams)
                  }}
                  defaultValue={searchParams.get('street') ?? ''}
                >
                  <option disabled selected={!searchParams.has('street')}>
                    Sélectionner une voie
                  </option>
                  {streets.map(el => (
                    <option key={el.street} value={el.street}>
                      {el.street}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {entrances.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>Allée</Label>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                onChange={event => {
                  selectEntrance(Number(event.target.value))
                }}
              >
                <option disabled selected={selectedEntrance == null}>
                  Sélectionner un numéro
                </option>
                {entrances
                  .filter(el => !selection.map(tbuilding => tbuilding.id).includes(el.id))
                  .map(el => (
                    <option key={el.id} value={el.id}>
                      {el.number} {el.street}, {el.zip}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {selectedEntrance != null && (
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                const tempList = selection.filter(el => el.id !== selectedEntrance)
                const newBuilding = entrances.find(el => el.id === selectedEntrance)
                if (newBuilding != null) {
                  tempList.push(newBuilding)
                }

                onSelectionChange(tempList)
                selectEntrance(null)
                showSearchBox(false)
              }}
            >
              Ajouter l'allée au territoire
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Button type="button" variant="secondary" onClick={() => showSearchBox(true)}>
      Ajouter une allée
    </Button>
  )
}
