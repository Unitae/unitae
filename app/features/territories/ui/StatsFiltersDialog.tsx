import { SlidersHorizontal } from 'lucide-react'
import { Form, useSearchParams } from 'react-router'
import type { PublisherGroup } from '~/database/generated/client'
import { AttributionCategory } from '~/features/territories/model/attribution-category'
import { DEFAULT_ATTRIBUTION_KINDS } from '~/features/territories/model/stats-filter-defaults'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { formatGroupName } from '~/shared/utils/format-group-name'

interface StatsFiltersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  action?: string
  phoneTypeActive?: boolean
  groups?: PublisherGroup[]
  theocraticYear: number
}

export default function StatsFiltersDialog({
  open,
  onOpenChange,
  action,
  phoneTypeActive = false,
  groups = [],
  theocraticYear,
}: StatsFiltersDialogProps) {
  const [params] = useSearchParams()

  if (!open) return null

  const startDate = params.get('startDate') ?? new Date(theocraticYear, 8, 1).toLocaleDateString('en-CA')
  const endDate = params.get('endDate') ?? new Date(theocraticYear + 1, 7, 31).toLocaleDateString('en-CA')

  // URL parser accepts `?kind=a&kind=b` (chip bar renders one per value); the
  // select stays single-value to keep the form simple. `kind=none` is the
  // explicit "Tous types" placeholder — distinct from the empty-URL default
  // which resolves to `[TerritoryKind.Classical]` on the server.
  const rawKinds = params.getAll('kind')
  const isAllTypes = rawKinds.includes('none')
  const selectKind = rawKinds.find(k => k !== 'none') ?? TerritoryKind.Classical

  const attributionKinds =
    params.getAll('attributionKind').length > 0 ? params.getAll('attributionKind') : DEFAULT_ATTRIBUTION_KINDS

  return (
    <div className="fixed top-0 left-0 z-50 flex h-full w-full items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="text-center font-display text-2xl">{m.stats_filter_title()}</CardTitle>
          <p className="text-center text-muted-foreground text-sm italic">{m.stats_filter_theocratic_year_hint()}</p>
        </CardHeader>
        <CardContent>
          <Form className="flex flex-col gap-4" action={action} onSubmit={() => onOpenChange(false)}>
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
              <Select name="kind" defaultValue={isAllTypes ? 'none' : selectKind}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{m.stats_filter_territory_all_types()}</SelectItem>
                  <SelectItem value={TerritoryKind.Classical}>{m.stats_filter_territory_door()}</SelectItem>
                  {phoneTypeActive && (
                    <SelectItem value={TerritoryKind.Phone}>{m.stats_filter_territory_phone()}</SelectItem>
                  )}
                  <SelectItem value={TerritoryKind.Commerces}>{m.stats_filter_territory_commerce()}</SelectItem>
                  <SelectItem value={TerritoryKind.Hotel}>{m.stats_filter_territory_hotel()}</SelectItem>
                  <SelectItem value={TerritoryKind.Univ}>{m.stats_filter_territory_university()}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{m.stats_filter_attribution_mode()}</Label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="attributionKind"
                  value={AttributionCategory.Default}
                  defaultChecked={attributionKinds.includes(AttributionCategory.Default)}
                  className="rounded border border-input"
                />
                {phoneTypeActive ? m.stats_filter_classic_mode() : m.stats_filter_door_to_door_mode()}
              </label>
              {!phoneTypeActive && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="attributionKind"
                    value={AttributionCategory.Phone}
                    defaultChecked={attributionKinds.includes(AttributionCategory.Phone)}
                    className="rounded border border-input"
                  />
                  {m.stats_filter_phone_mode()}
                </label>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="attributionKind"
                  value={AttributionCategory.Campaign}
                  defaultChecked={attributionKinds.includes(AttributionCategory.Campaign)}
                  className="rounded border border-input"
                />
                {m.stats_filter_campaign_mode()}
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{m.stats_filter_group_label()}</Label>
              <Select name="group" defaultValue={params.get('group') ?? 'none'}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{m.stats_filter_group_placeholder()}</SelectItem>
                  {groups.map(group => (
                    <SelectItem value={String(group.id)} key={group.id}>
                      {m.stats_filter_by_group({ group: formatGroupName(group.name) })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full gap-1.5">
              <SlidersHorizontal className="size-4" />
              {m.stats_filter_submit()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
