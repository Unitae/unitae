import { SlidersHorizontal } from 'lucide-react'
import { Form, useSearchParams } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'

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
          <PersonDropdown
            name="publisher"
            people={publishers}
            defaultValue={
              params.get('publisher') != null && params.get('publisher') !== 'none'
                ? (params.get('publisher') ?? '')
                : ''
            }
            placeholder={m.events_filters_publisher_all()}
            noneLabel={m.events_filters_publisher_all()}
          />
        )}
        <Button type="submit" variant="outline" size="sm">
          <SlidersHorizontal className="size-4" />
          {m.events_filters_submit()}
        </Button>
      </div>
    </Form>
  )
}
