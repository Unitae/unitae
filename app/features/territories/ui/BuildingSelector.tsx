import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { AggregatedEntrance } from '~/shared/types/entrance'

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
      <div className="flex flex-col gap-1 rounded-md bg-gray-50 p-2">
        <div className="flex gap-3">
          <label className="flex-1 text-slate-950">
            Code postal
            <select
              className="w-full appearance-none rounded-md border p-1 dark:border-gray-300 dark:bg-white"
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
          </label>
          {streets.length > 0 && (
            <label className="flex-1 text-slate-950">
              Voie
              <select
                className="w-full appearance-none rounded-md border p-1 dark:border-gray-300 dark:bg-white"
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
            </label>
          )}
        </div>
        {entrances.length > 0 && (
          <label className="flex-1 text-slate-950">
            Allée
            <select
              className="w-full appearance-none rounded-md border p-1 dark:border-gray-300 dark:bg-white"
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
          </label>
        )}
        {selectedEntrance != null && (
          <button
            className="mt-2 rounded-lg bg-slate-600 p-1 font-semibold text-white hover:bg-slate-900"
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
          </button>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      className="mt-2 rounded-lg bg-slate-600 p-1 font-semibold text-white hover:bg-slate-900"
      onClick={() => showSearchBox(true)}
    >
      Ajouter une allée
    </button>
  )
}
