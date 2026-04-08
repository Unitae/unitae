import { SlidersHorizontal } from 'lucide-react'
import { Form, useSearchParams } from 'react-router'
import type { SanitizedUser } from '~/features/authentication/server/sanitize-user.server'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

interface EventFiltersProps {
  action?: string
  publishers?: SanitizedUser[]
}

export default function EventFilters({ action }: EventFiltersProps) {
  const [params] = useSearchParams()

  return (
    <Form className="flex flex-col gap-2" action={action}>
      <Label className="font-medium text-muted-foreground text-sm">Filtres :</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="date"
          name="date"
          className="w-auto"
          defaultValue={params.get('date') ?? new Date().toISOString().split('T')[0]}
        />
        <Button type="submit" variant="outline" size="sm">
          <SlidersHorizontal className="size-4" />
          Filtrer
        </Button>
      </div>
    </Form>
  )
}
