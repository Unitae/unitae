import { ArchiveBoxIcon, ArchiveBoxXMarkIcon } from '@heroicons/react/24/outline'
import { Form } from 'react-router'
import type { Building } from '~/database/generated/client'

export default function ArchiveBuildingToggleButton({ building }: { building: Building }) {
  if (building.active === true) {
    return (
      <Form method="post" action={`/territories/building/${building.id}/disable`}>
        <button
          type="submit"
          title="Désactiver le batiment"
          className={'rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-gray-700 max-sm:p-2'}
        >
          <ArchiveBoxIcon className={'inline size-6 max-sm:size-5'} />
        </button>
      </Form>
    )
  }

  return (
    <Form method="post" action={`/territories/building/${building.id}/enable`}>
      <button
        type="submit"
        title="Activer le batiment"
        className={'rounded-lg bg-gray-500 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2'}
      >
        <ArchiveBoxXMarkIcon className={'inline size-6 max-sm:size-5'} />
      </button>
    </Form>
  )
}
