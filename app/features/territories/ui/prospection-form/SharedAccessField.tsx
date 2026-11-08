import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Checkbox } from '~/shared/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { Label } from '~/shared/ui/label'
import { cn } from '~/shared/utils/utils'

export interface StreetBuilding {
  id: number
  number: string
  street: string
  /** The territories of the building's residential entrance: the ones it leaves when linked here. */
  territories: string[]
}

interface SharedAccessFieldProps {
  /** The territories of this residential entrance. */
  territories: string[]
  /** The other buildings already sharing this residential entrance. */
  linked: StreetBuilding[]
  /** Buildings of the same street that could be linked. */
  candidates: StreetBuilding[]
}

const address = (building: StreetBuilding) => `${building.number} ${building.street}`

/**
 * Which other buildings share this building's residential access. Posts their ids; the building itself is
 * always part of the entrance. Once buildings are linked the box stays ticked: unlink them one by one.
 */
export function SharedAccessField({ territories, linked, candidates }: SharedAccessFieldProps) {
  const [shares, setShares] = useState(linked.length > 0)
  const [others, setOthers] = useState(linked)
  const available = candidates.filter(candidate => !others.some(other => other.id === candidate.id))

  return (
    <div className="col-span-full flex flex-col gap-2.5 border-border border-t pt-3">
      <input
        type="hidden"
        name="shared-entrance-buildings"
        value={shares ? others.map(({ id }) => id).join(',') : ''}
      />
      <div className="flex min-h-8 items-center gap-2.5">
        <Checkbox
          id="shares-access"
          checked={shares}
          disabled={linked.length > 0}
          onCheckedChange={checked => setShares(checked === true)}
        />
        <Label htmlFor="shares-access" className="font-normal">
          {m.prospection_shared_entrance_checkbox()}
        </Label>
      </div>
      {shares && (
        <div className="flex flex-wrap items-center gap-1.5 pl-6.5">
          {others.map(building => (
            <span
              key={building.id}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-hover pr-1 pl-2.5 text-sm"
            >
              {address(building)}
              <MovedFrom building={building} territories={territories} />
              <button
                type="button"
                aria-label={m.building_shared_unlink({ address: address(building) })}
                onClick={() => setOthers(others.filter(other => other.id !== building.id))}
                className="grid size-5 place-content-center rounded text-faint outline-none transition-colors hover:bg-border hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {available.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm">
                  <Plus />
                  {m.building_shared_link()}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {available.map(building => (
                  <DropdownMenuItem key={building.id} onSelect={() => setOthers([...others, building])}>
                    {address(building)}
                    <MovedFrom building={building} territories={territories} className="ml-auto pl-4" />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A building from another territory moves into this entrance's territory once linked: its territory is shown so
 * that move is never silent. Nothing is shown when it leaves no territory, or the same ones.
 */
function MovedFrom({
  building,
  territories,
  className,
}: {
  building: StreetBuilding
  territories: string[]
  className?: string
}) {
  const same =
    building.territories.length === territories.length && building.territories.every(t => territories.includes(t))
  if (building.territories.length === 0 || same) return null
  const label = building.territories.length === 1 ? m.building_header_territory() : m.building_header_territories()
  return (
    <span className={cn('text-faint text-xs', className)}>
      {label} {building.territories.join(', ')}
    </span>
  )
}
