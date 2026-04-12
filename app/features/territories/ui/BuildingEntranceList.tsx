import { Link } from 'react-router'
import { type ShopKind, shopKindLabels } from '~/features/territories/model/shop-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import type { Entrance } from '~/shared/types/entrance'
import { Checkbox } from '~/shared/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

export type EntranceListVariant = 'residential' | 'commerce' | 'phone' | 'simple'

const accessLabels: Record<number, string> = {
  [TerritoryAccess.Intercom]: 'Interphone',
  [TerritoryAccess.Code]: 'Digicode',
  [TerritoryAccess.Doorbell]: 'Sonnette',
}

export default function BuildingEntranceList({
  entrances,
  selectedIds,
  variant = 'simple',
  setSelectedIds,
}: {
  entrances: Entrance[]
  selectedIds: number[]
  variant?: EntranceListVariant
  setSelectedIds: (ids: number[]) => void
}) {
  return (
    <Table className="self-start">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]" />
          <TableHead className="w-[100px]">Code Postal</TableHead>
          <TableHead className="w-[80px] text-center">Nº</TableHead>
          <TableHead>Rue</TableHead>
          {(variant === 'residential' || variant === 'phone') && <TableHead className="w-[120px]">Accès</TableHead>}
          {variant === 'residential' && <TableHead className="w-[80px] text-center">Foyers</TableHead>}
          {(variant === 'residential' || variant === 'phone') && (
            <TableHead className="w-[80px] text-center">Tél.</TableHead>
          )}
          {variant === 'commerce' && <TableHead>Type de commerce</TableHead>}
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entrances.map(entrance => (
          <BuildingEntranceListItem
            key={entrance.id}
            entrance={entrance}
            checked={selectedIds.includes(entrance.id)}
            variant={variant}
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
  variant = 'simple',
  onChange = () => {},
}: {
  entrance: Entrance
  checked: boolean
  variant?: EntranceListVariant
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
      {(variant === 'residential' || variant === 'phone') && (
        <TableCell>{entrance.access != null ? accessLabels[entrance.access] ?? '-' : '-'}</TableCell>
      )}
      {variant === 'residential' && <TableCell className="text-center">{entrance.homes ?? '-'}</TableCell>}
      {(variant === 'residential' || variant === 'phone') && (
        <TableCell className="text-center">{entrance.phones ?? '-'}</TableCell>
      )}
      {variant === 'commerce' && (
        <TableCell>{shopKindLabels[entrance.shopKind as ShopKind] ?? (entrance.shopKind || '-')}</TableCell>
      )}
      <TableCell className="max-w-[200px] truncate">{entrance.notes || '-'}</TableCell>
    </TableRow>
  )
}
