import { useState } from 'react'
import type { PublisherGroup } from '~/database/generated/client'

import { PublisherType } from '~/shared/types/publisher-type'
import type { UserInput } from '~/shared/types/user-input'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'

export default function PublisherFieldServiceForm({
  user,
  groups,
  hideAuxiliaryPioneer = false,
}: {
  user?: UserInput
  groups: PublisherGroup[]
  hideAuxiliaryPioneer: boolean
}) {
  const [type, setType] = useState(user?.type ?? PublisherType.Normal)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prédication</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="group">Groupe de prédication</Label>
          <select
            id="group"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            name="group"
            defaultValue={user?.publisherGroupId ?? ''}
          >
            <option>Choisir un groupe de prédication</option>
            {groups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name.toLocaleUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">Profil du proclamateur</Label>
          <select
            id="type"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            name="type"
            value={type}
            onChange={e => {
              setType(e.target.value as PublisherType)
            }}
          >
            <option value={PublisherType.Normal}>Choisir un profil</option>
            {!hideAuxiliaryPioneer && <option value={PublisherType.PionnierAuxiliaires}>Pionnier auxiliaire</option>}
            <option value={PublisherType.PionnierPermanant}>Pionnier permanent</option>
            <option value={PublisherType.PionnierSpecial}>Pionnier spécial</option>
            <option value={PublisherType.Missionnaire}>Missionnaire</option>
          </select>
          {type === PublisherType.PionnierAuxiliaires && (
            <p className="text-muted-foreground text-xs italic">
              Attention, ce profil sera appliqué chaque mois automatiquement sans interruption. Si le proclamateur ne
              prend le service de pionnier que pour quelques mois ou moins, il est préférable d'indiquer qu'il est
              pionnier auxiliaire dans le rapport de service.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
