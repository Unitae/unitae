import { SlidersHorizontal } from 'lucide-react'
import { Form, useSearchParams } from 'react-router'
import type { PublisherGroup } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
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
      <span className="font-medium text-muted-foreground text-sm">Filtres :</span>
      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm max-sm:flex-1"
          name="type"
          defaultValue={params.get('type') ?? undefined}
        >
          <option value="none">Mode</option>
          <option value={TerritoryAttributionKind.Default}>{phoneTypeActive ? 'Classique' : 'Porte à Porte'}</option>
          {!phoneTypeActive && <option value={TerritoryAttributionKind.Phone}>Téléphone</option>}
          <option value={TerritoryAttributionKind.Campaign}>Campagne de distribution</option>
        </select>
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm max-sm:flex-1"
          name="group"
          defaultValue={params.get('group') ?? undefined}
        >
          <option value="none">Groupe</option>
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
          <option value="none">Statut</option>
          <option value={'current'}>En cours</option>
          <option value={'late'}>En retard</option>
        </select>
        <Input
          type="text"
          name="search"
          className="w-auto max-sm:flex-1"
          placeholder="Recherche"
          defaultValue={params.get('search') ?? undefined}
        />
        <Button type="submit" variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal className="size-4" />
          Filtrer
        </Button>
      </div>
    </Form>
  )
}
