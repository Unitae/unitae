import { DocumentArrowDownIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { Link } from 'react-router'

export default function S13ExportButton({ theocraticYear }: { theocraticYear: number }) {
  const [shouldShowExport, setShouldShowExport] = useState(false)

  return (
    <div className="relative max-sm:hidden">
      <button
        type="button"
        className="flex cursor-pointer items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
        title="Télécharger les exports"
        onClick={() => setShouldShowExport(!shouldShowExport)}
      >
        <DocumentArrowDownIcon className="inline size-6 max-sm:size-5" />
      </button>
      <div
        className={`${shouldShowExport ? 'flex' : 'hidden'} absolute top-13 right-0 w-64 flex-col items-stretch gap-1 max-sm:top-10 max-sm:right-auto max-sm:left-0`}
      >
        <Link
          to={`/territories/attributions/export/${theocraticYear}/xlsx`}
          className="rounded-lg bg-white p-3 text-gray-700 hover:text-teal-600 max-sm:p-2 max-sm:text-sm"
          title={`Télécharger le fichier S-13 au format Excel pour l'année ${theocraticYear}`}
          reloadDocument
        >
          Exporter la S-13 (Excel)
        </Link>
        <Link
          to={`/territories/attributions/export/${theocraticYear}/pdf`}
          className="rounded-lg bg-white p-3 text-gray-700 hover:text-teal-600 max-sm:p-2 max-sm:text-sm"
          title={`Télécharger le fichier S-13 au format PDF pour l'année ${theocraticYear}`}
          reloadDocument
        >
          Exporter la S-13 (PDF)
        </Link>
      </div>
    </div>
  )
}
