import { SlidersHorizontal } from 'lucide-react'
import { Form, useSearchParams } from 'react-router'
import * as m from '~/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

interface EventFiltersProps {
  action?: string
  defaults: { from: string; to: string }
  publishers?: Array<{ id: number; firstname: string | null; lastname: string | null }>
}

export default function EventFilters({ action, defaults, publishers }: EventFiltersProps) {
  const [params] = useSearchParams()

  return (
    <Form className="flex flex-col gap-2" action={action}>
      <Label className="font-medium text-muted-foreground text-sm">{m.events_filters_label()}</Label>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="filter-from" className="text-sm">
            {m.events_filters_from()}
          </Label>
          <Input
            id="filter-from"
            type="date"
            name="from"
            className="w-auto"
            defaultValue={params.get('from') ?? defaults.from}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="filter-to" className="text-sm">
            {m.events_filters_to()}
          </Label>
          <Input
            id="filter-to"
            type="date"
            name="to"
            className="w-auto"
            defaultValue={params.get('to') ?? defaults.to}
          />
        </div>
        {publishers && (
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            name="publisher"
            defaultValue={params.get('publisher') ?? undefined}
          >
            <option value="none">{m.events_filters_publisher_all()}</option>
            {publishers.map(p => (
              <option value={p.id} key={p.id}>
                {p.lastname?.toLocaleUpperCase() ?? ''} {p.firstname ?? ''}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" variant="outline" size="sm">
          <SlidersHorizontal className="size-4" />
          {m.events_filters_submit()}
        </Button>
      </div>
    </Form>
  )
}
