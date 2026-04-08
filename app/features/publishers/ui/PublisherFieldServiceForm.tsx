import { useState } from 'react'
import type { PublisherGroup } from '~/database/generated/client'

import { PublisherType } from '~/shared/types/publisher-type'
import type { UserInput } from '~/shared/types/user-input'

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
    <>
      <h2 className="font-semibold text-xl max-sm:text-lg">Prédication</h2>
      <div className="flex gap-3">
        <label className="flex-1">
          Groupe de prédication
          <select
            className="w-full appearance-none rounded-md border p-1 dark:border-gray-300"
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
        </label>
      </div>

      <div className="flex gap-3">
        <label className="flex-1">
          Profil du proclamateur
          <select
            className="w-full appearance-none rounded-md border p-1 dark:border-gray-300"
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
            <p className="mt-1 text-gray-500 text-sm italic dark:text-gray-400">
              Attention, ce profil sera appliqué chaque mois automatiquement sans interruption. Si le proclamateur ne
              prend le service de pionnier que pour quelques mois ou moins, il est préférable d'indiquer qu'il est
              pionnier auxiliaire dans le rapport de service.
            </p>
          )}
        </label>
      </div>
    </>
  )
}
