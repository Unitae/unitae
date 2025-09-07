import { Link } from 'react-router'
import type { Entrance } from '~/shared/types/entrance'

export default function BuildingEntranceList({
  entrances,
  selectedIds,
  showShops = false,
  setSelectedIds,
}: {
  entrances: Entrance[]
  selectedIds: number[]
  showShops?: boolean
  setSelectedIds: (ids: number[]) => void
}) {
  return (
    <table className="grow border-collapse self-start">
      <thead className="border-b border-b-slate-300 text-left font-bold max-sm:text-md dark:border-b-slate-500">
        <tr>
          <th className="w-[50px] py-4 text-center max-sm:w-12" />
          <th className="w-[150px] py-4 max-sm:w-14 max-sm:text-center">Code Postal</th>
          <th className="w-[150px] text-ellipsis text-wrap px-1 py-4 text-center max-sm:w-12">Nº</th>
          <th className="px-1 py-4 max-sm:text-center">Rue</th>
          {showShops && <th className="px-1 py-4 max-sm:text-center">Type de commerce</th>}
          <th className="px-1 py-4 max-sm:text-center">Notes</th>
        </tr>
      </thead>
      <tbody className="text-left max-sm:text-sm">
        {entrances.map(entrance => (
          <BuildingEntranceListItem
            key={entrance.id}
            entrance={entrance}
            checked={selectedIds.includes(entrance.id)}
            showShops={showShops}
            onChange={checked => {
              if (checked) {
                setSelectedIds([...selectedIds, entrance.id])
                return
              }

              setSelectedIds(selectedIds.filter(id => id !== entrance.id))
            }}
          />
        ))}
      </tbody>
    </table>
  )
}

function BuildingEntranceListItem({
  entrance,
  checked,
  showShops = false,
  onChange = () => {},
}: {
  entrance: Entrance
  checked: boolean
  showShops?: boolean
  onChange?: (checked: boolean) => void
}) {
  const firstBuilding = entrance.buildings[0]
  if (!firstBuilding) return null

  return (
    <tr className="border-b border-b-slate-200 dark:border-b-slate-800">
      <td className="py-3 max-sm:text-center">
        <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      </td>
      <td className="py-3 max-sm:text-center">{firstBuilding.zip}</td>
      <td className="py-3 text-center">
        {entrance.buildings.map((building, index, array) => (
          <Link
            key={building.id}
            to={`/territories/building/${building.id}/edit`}
            target="_blank"
            className="hover:text-teal-600"
          >
            {building.number}
            {index < array.length - 1 && ', '}
          </Link>
        ))}
      </td>
      <td className="px-1 py-3 max-sm:text-center">{firstBuilding.street}</td>
      {showShops && <td className="px-1 py-3 max-sm:text-center">{firstBuilding.shopKind ?? '-'}</td>}
      <td className="px-1 py-3 max-sm:text-center">{entrance.buildings.map(el => el.notes).join(', ')}</td>
      <td />
    </tr>
  )
}
