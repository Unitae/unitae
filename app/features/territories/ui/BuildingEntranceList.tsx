import { Link } from 'react-router'
import type { Entrance } from '~/shared/types/entrance'
import { Checkbox } from '~/shared/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

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
    <Table className="self-start">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]" />
          <TableHead className="w-[150px]">Code Postal</TableHead>
          <TableHead className="w-[150px] text-center">Nº</TableHead>
          <TableHead>Rue</TableHead>
          {showShops && <TableHead>Type de commerce</TableHead>}
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
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
      </TableBody>
    </Table>
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
    <TableRow>
      <TableCell>
        <Checkbox checked={checked} onCheckedChange={value => onChange(value === true)} />
      </TableCell>
      <TableCell>{firstBuilding.zip}</TableCell>
      <TableCell className="text-center">
        {entrance.buildings.map((building, index, array) => (
          <Link
            key={building.id}
            to={`/territories/building/${building.id}/edit`}
            target="_blank"
            className="hover:text-primary"
          >
            {building.number}
            {index < array.length - 1 && ', '}
          </Link>
        ))}
      </TableCell>
      <TableCell>{firstBuilding.street}</TableCell>
      {showShops && <TableCell>{firstBuilding.shopKind ?? '-'}</TableCell>}
      <TableCell>{entrance.buildings.map(el => el.notes).join(', ')}</TableCell>
    </TableRow>
  )
}
