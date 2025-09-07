import { DocumentIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import type { BoardDocument } from '~/database/generated/client'
import { Link } from 'react-router'

export function DocumentCard({ file, alreadyViewed = false }: { file: BoardDocument; alreadyViewed?: boolean }) {
  return (
    <Link
      reloadDocument
      to={`./documents/${file.id}/view`}
      className="relative inline-flex w-40 flex-col items-center justify-center rounded-md border border-slate-300 bg-slate-300 px-3 py-5 text-center text-slate-500 shadow-slate-50 hover:border-teal-600 hover:text-teal-600 hover:shadow-lg max-sm:w-full max-sm:flex-row max-sm:justify-between"
    >
      {!alreadyViewed && (
        <div className="absolute -top-3 -right-3 max-sm:-top-2 max-sm:-right-2">
          <div className="flex size-6 items-center justify-center rounded-full bg-red-600 text-white max-sm:size-7">
            <ExclamationCircleIcon className="size-4 p-0" />
          </div>
        </div>
      )}
      {file.type === 'pdf' && <DocumentIcon className="mb-3 size-20 max-sm:mb-0 max-sm:size-10" />}
      <span className="text-slate-700">{file.title}</span>
      <span className="mt-3 text-sm max-sm:mt-0">{new Date(file.createdAt).toLocaleDateString('fr-FR')}</span>
    </Link>
  )
}
