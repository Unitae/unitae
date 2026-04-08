import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { Form, useSearchParams } from 'react-router'
import type { PublisherGroup } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

interface StatsFiltersProps {
  action?: string
  phoneTypeActive?: boolean
  groups?: PublisherGroup[]
  theocraticYear?: number
}

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
        <span className="rounded-md border-2 border-teal-500 bg-slate-950 px-2 py-1 text-white italic">
          {new Date(startDate).toLocaleDateString('fr-FR')} - {new Date(endDate).toLocaleDateString('fr-FR')}
        </span>
        <span className="rounded-md border-2 border-orange-500 bg-slate-950 px-2 py-1 text-white italic">
          {TerritoryKind.Classical === kind && `Territoire "Porte à Porte"`}
          {TerritoryKind.Phone === kind && `Territoire "Téléphone"`}
          {TerritoryKind.Commerces === kind && `Territoire "Commerce"`}
          {TerritoryKind.Hotel === kind && `Territoire "Hôtel"`}
          {TerritoryKind.Univ === kind && `Territoire "Université"`}
        </span>
        {attributionKinds.map(attribution => (
          <span
            key={attribution}
            className="rounded-md border-2 border-amber-500 bg-slate-950 px-2 py-1 text-white italic"
          >
            {TerritoryAttributionKind.Campaign === attribution && `Sortie pour une campagne de distribution`}
            {TerritoryAttributionKind.Default === attribution && phoneTypeActive === true && `Sortie classique`}
            {TerritoryAttributionKind.Default === attribution &&
              phoneTypeActive === false &&
              `Sortie pour du porte à porte`}
            {TerritoryAttributionKind.Phone === attribution && `Sortie pour du téléphone`}
          </span>
        ))}
        {group != null && (
          <span className="rounded-md border-2 border-violet-500 bg-slate-950 px-2 py-1 text-white italic">
            {`Sortie par ${groups?.find(g => g.id === Number(group))?.name.toLocaleUpperCase() ?? ''}`}
          </span>
        )}
      </div>
      <button
        type="button"
        className="inline-flex flex-row items-center justify-center gap-1 rounded-md border border-slate-300 bg-slate-300 px-2 py-1 text-slate-500 shadow-slate-50 hover:border-teal-600 hover:text-teal-600 hover:shadow-lg"
        onClick={() => setIsOpen(!isOpen)}
      >
        Modifier les filtres
      </button>
      {isOpen && (
        <div className="fixed top-0 left-0 z-50 flex h-full w-full items-center justify-center bg-black/50 p-4">
          <div className="mt-3 flex w-full max-w-3xl flex-col rounded-md border border-slate-300 bg-slate-100 p-4 text-black shadow-sm">
            <h2 className="mb-6 text-center font-semibold text-4xl max-sm:text-lg">Filtres</h2>
            <span className="text-slate-700 text-sm italic">(L'année théo. va du 1er septembre au 31 aout)</span>
            <Form className="flex flex-col" action={action} onSubmit={() => setIsOpen(false)}>
              <div className="flex flex-wrap gap-3">
                <label>
                  Date de début :
                  <input
                    type="date"
                    name="startDate"
                    className="ml-1 inline-block appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
                    defaultValue={startDate}
                  />
                </label>
                <label>
                  Date de fin :
                  <input
                    type="date"
                    name="endDate"
                    className="ml-1 inline-block appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
                    defaultValue={endDate}
                  />
                </label>

                <label className="w-full">
                  Type de territoire : <br />
                  <select
                    className="inline-block w-full appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
                    name="kind"
                    defaultValue={kind}
                  >
                    <option value="none">Type de territoire</option>
                    <option value={TerritoryKind.Classical}>Territoire "Porte à Porte"</option>
                    {phoneTypeActive && <option value={TerritoryKind.Phone}>Territoire "Téléphone"</option>}
                    <option value={TerritoryKind.Commerces}>Territoire "Commerce"</option>
                    <option value={TerritoryKind.Hotel}>Territoire "Hôtel"</option>
                    <option value={TerritoryKind.Univ}>Territoire "Université"</option>
                  </select>
                </label>
                <div className="w-full">
                  Mode de sortie : <br />
                  <label className="block w-full">
                    <input
                      type="checkbox"
                      name="attributionKind"
                      value={TerritoryAttributionKind.Default}
                      defaultChecked={attributionKinds.includes(TerritoryAttributionKind.Default)}
                    />{' '}
                    {phoneTypeActive ? 'Sortie classique' : 'Sortie pour du porte à porte'}
                  </label>
                  {!phoneTypeActive && (
                    <label className="block w-full">
                      <input
                        type="checkbox"
                        name="attributionKind"
                        value={TerritoryAttributionKind.Phone}
                        defaultChecked={attributionKinds.includes(TerritoryAttributionKind.Phone)}
                      />{' '}
                      Sortie pour du téléphone
                    </label>
                  )}
                  <label className="block w-full">
                    <input
                      type="checkbox"
                      name="attributionKind"
                      value={TerritoryAttributionKind.Campaign}
                      defaultChecked={attributionKinds.includes(TerritoryAttributionKind.Campaign)}
                    />{' '}
                    Sortie pour une campagne de distribution
                  </label>
                </div>
                <label className="w-full">
                  Groupe de prédication : <br />
                  <select
                    className="inline-block w-full appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
                    name="group"
                    defaultValue={params.get('group') ?? undefined}
                  >
                    <option value="none">Groupe de prédication</option>
                    {groups.map(group => (
                      <option value={group.id} key={group.id}>
                        Par {group.name.toLocaleUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="inline-flex w-full flex-row items-center justify-center gap-1 rounded-md border border-slate-300 bg-slate-300 px-2 py-1 text-slate-500 shadow-slate-50 hover:border-teal-600 hover:text-teal-600 hover:shadow-lg"
                  type="submit"
                >
                  <AdjustmentsHorizontalIcon className="size-6 text-teal-600" />
                  Filtrer
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}
    </>
  )
}
