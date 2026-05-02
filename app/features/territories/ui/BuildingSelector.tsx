import { useState } from 'react'
import { useSearchParams } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import type { AggregatedEntrance } from '~/shared/types/entrance'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

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
              <Label>{m.prospection_selector_zip_label()}</Label>
              <Select
                value={searchParams.get('zip') ?? undefined}
                onValueChange={value => {
                  searchParams.set('zip', value)
                  setSearchParams(searchParams)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.prospection_selector_zip_placeholder()} />
                </SelectTrigger>
                <SelectContent>
                  {zips.map(el => (
                    <SelectItem key={el.zip} value={el.zip}>
                      {el.zip}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {streets.length > 0 && (
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>{m.prospection_selector_street_label()}</Label>
                <Select
                  value={searchParams.get('street') ?? undefined}
                  onValueChange={value => {
                    searchParams.set('street', value)
                    setSearchParams(searchParams)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={m.prospection_selector_street_placeholder()} />
                  </SelectTrigger>
                  <SelectContent>
                    {streets.map(el => (
                      <SelectItem key={el.street} value={el.street}>
                        {el.street}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {entrances.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>{m.prospection_selector_entrance_label()}</Label>
              <Select
                value={selectedEntrance != null ? String(selectedEntrance) : undefined}
                onValueChange={value => selectEntrance(Number(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.prospection_selector_entrance_placeholder()} />
                </SelectTrigger>
                <SelectContent>
                  {entrances
                    .filter(el => !selection.map(tbuilding => tbuilding.id).includes(el.id))
                    .map(el => (
                      <SelectItem key={el.id} value={String(el.id)}>
                        {el.number} {el.street}, {el.zip}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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
              {m.prospection_selector_add_entrance()}
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Button type="button" variant="secondary" onClick={() => showSearchBox(true)}>
      {m.prospection_selector_add_button()}
    </Button>
  )
}
