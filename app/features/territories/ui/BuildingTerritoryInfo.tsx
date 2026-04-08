import { Form } from 'react-router'
import type { Building } from '~/database/generated/client'

export default function BuildingTerritoryInfo({ building }: { building: Building }) {
  return (
    <Form method="post" className="mb-5 flex flex-col gap-3">
      <label className="grow">
        Notes pour le service Territoires{' '}
        <span className="text-gray-300 text-sm dark:text-gray-700">(Ne sera pas visible sur le territoire)</span>
        <textarea className="w-full rounded-md border p-1 dark:border-gray-300" rows={4} name="notes">
          {building.notes}
        </textarea>
      </label>
      <label className="grow">
        Informations pour les proclamateurs{' '}
        <span className="text-gray-300 text-sm dark:text-gray-700">
          (Sera visible sur le territoire pour le proclamateur)
        </span>
        <textarea className="w-full rounded-md border p-1 dark:border-gray-300" rows={2} name="important-notes">
          {building.importantNotes}
        </textarea>
      </label>
      <button
        className="my-4 inline-flex items-center justify-center self-start rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
        type="submit"
      >
        Enregistrer les notes
      </button>
    </Form>
  )
}
