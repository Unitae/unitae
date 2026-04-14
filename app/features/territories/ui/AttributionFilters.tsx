import { SlidersHorizontal } from 'lucide-react'
import { Form, useSearchParams } from 'react-router'
import type { PublisherGroup } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import * as m from '~/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'

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
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm max-sm:flex-1"
          name="type"
          defaultValue={params.get('type') ?? undefined}
        >
          <option value="none">{m.territories_filter_mode()}</option>
          <option value={TerritoryAttributionKind.Default}>
            {phoneTypeActive ? m.territories_filter_default_classic() : m.territories_type_classical_capitalized()}
          </option>
          {!phoneTypeActive && (
            <option value={TerritoryAttributionKind.Phone}>{m.territories_type_phone_singular()}</option>
          )}
          <option value={TerritoryAttributionKind.Campaign}>{m.attributions_type_campaign()}</option>
        </select>
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm max-sm:flex-1"
          name="group"
          defaultValue={params.get('group') ?? undefined}
        >
          <option value="none">{m.territories_filter_group()}</option>
          {groups.map(group => (
            <option value={group.id} key={group.id}>
              {group.name.toLocaleUpperCase()}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm max-sm:flex-1"
          name="status"
          defaultValue={params.get('status') ?? undefined}
        >
          <option value="none">{m.territories_filter_status()}</option>
          <option value={'current'}>{m.territories_filter_status_current()}</option>
          <option value={'late'}>{m.territories_filter_status_late()}</option>
        </select>
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
