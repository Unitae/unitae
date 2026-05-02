import { SlidersHorizontal } from 'lucide-react'
import { Form, useSearchParams } from 'react-router'
import type { PublisherGroup } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import * as m from '~/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

interface AttributionFiltersProps {
  action?: string
  phoneTypeActive?: boolean
  groups?: PublisherGroup[]
}

export default function AttributionFilters({ action, phoneTypeActive = false, groups = [] }: AttributionFiltersProps) {
  const [params] = useSearchParams()

  return (
    <Form className="flex flex-col gap-1.5" action={action}>
      <span className="font-medium text-muted-foreground text-sm">{m.territories_filter_label()}</span>
      <div className="flex flex-wrap gap-2">
        <Select name="type" defaultValue={params.get('type') ?? 'none'}>
          <SelectTrigger className="max-sm:flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{m.territories_filter_mode()}</SelectItem>
            <SelectItem value={TerritoryAttributionKind.Default}>
              {phoneTypeActive ? m.territories_filter_default_classic() : m.territories_type_classical_capitalized()}
            </SelectItem>
            {!phoneTypeActive && (
              <SelectItem value={TerritoryAttributionKind.Phone}>{m.territories_type_phone_singular()}</SelectItem>
            )}
            <SelectItem value={TerritoryAttributionKind.Campaign}>{m.attributions_type_campaign()}</SelectItem>
          </SelectContent>
        </Select>
        <Select name="group" defaultValue={params.get('group') ?? 'none'}>
          <SelectTrigger className="max-sm:flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{m.territories_filter_group()}</SelectItem>
            {groups.map(group => (
              <SelectItem value={String(group.id)} key={group.id}>
                {group.name.toLocaleUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select name="status" defaultValue={params.get('status') ?? 'none'}>
          <SelectTrigger className="max-sm:flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{m.territories_filter_status()}</SelectItem>
            <SelectItem value="current">{m.territories_filter_status_current()}</SelectItem>
            <SelectItem value="late">{m.territories_filter_status_late()}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="text"
          name="search"
          className="w-auto max-sm:flex-1"
          placeholder={m.territories_filter_search()}
          defaultValue={params.get('search') ?? undefined}
        />
        <Button type="submit" variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal className="size-4" />
          {m.territories_filter_submit()}
        </Button>
      </div>
    </Form>
  )
}
