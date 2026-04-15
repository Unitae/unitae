import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Form, useSearchParams } from 'react-router'
import type { PublisherGroup } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import * as m from '~/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

interface StatsFiltersProps {
  action?: string
  phoneTypeActive?: boolean
  groups?: PublisherGroup[]
  theocraticYear?: number
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: filter component with multiple conditional UI branches
export default function StatsFilters({
  action,
  phoneTypeActive = false,
  groups = [],
  theocraticYear = 2025,
}: StatsFiltersProps) {
  const [params] = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)

  const startDate = params.get('startDate') ?? new Date(theocraticYear, 8, 1).toLocaleDateString('en-CA')
  const endDate = params.get('endDate') ?? new Date(theocraticYear + 1, 7, 31).toLocaleDateString('en-CA')
  const kind = params.get('kind') ?? TerritoryKind.Classical
  const attributionKinds =
    params.getAll('attributionKind').length > 0
      ? params.getAll('attributionKind')
      : [TerritoryAttributionKind.Campaign, TerritoryAttributionKind.Default]
  const group = params.get('group') != null && params.get('group') !== 'none' ? params.get('group') : undefined

  return (
    <>
      <div className="mb-4 flex flex-row flex-wrap gap-2">
        <Badge variant="outline" className="border-primary text-primary">
          {new Date(startDate).toLocaleDateString('fr-FR')} - {new Date(endDate).toLocaleDateString('fr-FR')}
        </Badge>
        <Badge variant="outline" className="border-orange-500 text-orange-500">
          {TerritoryKind.Classical === kind && m.stats_filter_territory_door()}
          {TerritoryKind.Phone === kind && m.stats_filter_territory_phone()}
          {TerritoryKind.Commerces === kind && m.stats_filter_territory_commerce()}
          {TerritoryKind.Hotel === kind && m.stats_filter_territory_hotel()}
          {TerritoryKind.Univ === kind && m.stats_filter_territory_university()}
        </Badge>
        {attributionKinds.map(attribution => (
          <Badge key={attribution} variant="outline" className="border-amber-500 text-amber-500">
            {TerritoryAttributionKind.Campaign === attribution && m.stats_filter_badge_campaign()}
            {TerritoryAttributionKind.Default === attribution &&
              phoneTypeActive === true &&
              m.stats_filter_badge_door_classic()}
            {TerritoryAttributionKind.Default === attribution &&
              phoneTypeActive === false &&
              m.stats_filter_badge_door()}
            {TerritoryAttributionKind.Phone === attribution && m.stats_filter_badge_phone()}
          </Badge>
        ))}
        {group != null && (
          <Badge variant="outline" className="border-violet-500 text-violet-500">
            {m.stats_filter_badge_group({
              group: groups?.find(g => g.id === Number(group))?.name.toLocaleUpperCase() ?? '',
            })}
          </Badge>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5" onClick={() => setIsOpen(!isOpen)}>
        <SlidersHorizontal className="size-4" />
        {m.stats_filter_modify()}
      </Button>
      {isOpen && (
        <div className="fixed top-0 left-0 z-50 flex h-full w-full items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-3xl">
            <CardHeader>
              <CardTitle className="text-center font-display text-2xl">{m.stats_filter_title()}</CardTitle>
              <p className="text-center text-muted-foreground text-sm italic">
                {m.stats_filter_theocratic_year_hint()}
              </p>
            </CardHeader>
            <CardContent>
              <Form className="flex flex-col gap-4" action={action} onSubmit={() => setIsOpen(false)}>
                <div className="flex flex-wrap gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>{m.stats_filter_start_date()}</Label>
                    <Input type="date" name="startDate" defaultValue={startDate} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>{m.stats_filter_end_date()}</Label>
                    <Input type="date" name="endDate" defaultValue={endDate} />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>{m.stats_filter_territory_type()}</Label>
                  <select
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    name="kind"
                    defaultValue={kind}
                  >
                    <option value="none">{m.stats_filter_territory_type_placeholder()}</option>
                    <option value={TerritoryKind.Classical}>{m.stats_filter_territory_door()}</option>
                    {phoneTypeActive && <option value={TerritoryKind.Phone}>{m.stats_filter_territory_phone()}</option>}
                    <option value={TerritoryKind.Commerces}>{m.stats_filter_territory_commerce()}</option>
                    <option value={TerritoryKind.Hotel}>{m.stats_filter_territory_hotel()}</option>
                    <option value={TerritoryKind.Univ}>{m.stats_filter_territory_university()}</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>{m.stats_filter_attribution_mode()}</Label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="attributionKind"
                      value={TerritoryAttributionKind.Default}
                      defaultChecked={attributionKinds.includes(TerritoryAttributionKind.Default)}
                      className="rounded border border-input"
                    />
                    {phoneTypeActive ? m.stats_filter_classic_mode() : m.stats_filter_door_to_door_mode()}
                  </label>
                  {!phoneTypeActive && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="attributionKind"
                        value={TerritoryAttributionKind.Phone}
                        defaultChecked={attributionKinds.includes(TerritoryAttributionKind.Phone)}
                        className="rounded border border-input"
                      />
                      {m.stats_filter_phone_mode()}
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="attributionKind"
                      value={TerritoryAttributionKind.Campaign}
                      defaultChecked={attributionKinds.includes(TerritoryAttributionKind.Campaign)}
                      className="rounded border border-input"
                    />
                    {m.stats_filter_campaign_mode()}
                  </label>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>{m.stats_filter_group_label()}</Label>
                  <select
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    name="group"
                    defaultValue={params.get('group') ?? undefined}
                  >
                    <option value="none">{m.stats_filter_group_placeholder()}</option>
                    {groups.map(group => (
                      <option value={group.id} key={group.id}>
                        {m.stats_filter_by_group({ group: group.name.toLocaleUpperCase() })}
                      </option>
                    ))}
                  </select>
                </div>

                <Button type="submit" className="w-full gap-1.5">
                  <SlidersHorizontal className="size-4" />
                  {m.stats_filter_submit()}
                </Button>
              </Form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
