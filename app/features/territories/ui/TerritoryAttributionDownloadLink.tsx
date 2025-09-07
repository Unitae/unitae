import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import type { Attribution, Territory, User } from '~/database/generated/client'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { useEffect, useState } from 'react'
import { TerritoryAttributionDocument } from './TerritoryAttributionDocument'

export function TerritoryAttributionDownloadLink({
  year,
  territories,
  children,
}: {
  year: number
  territories: (Territory & { attributions: (Attribution & { publisher: User })[] })[]
  children?: React.ReactNode
}) {
  const [shouldShowPdf, showPdf] = useState(false)

  useEffect(() => {
    showPdf(true)
  }, [])

  return (
    <>
      {shouldShowPdf && (
        <PDFDownloadLink
          document={<TerritoryAttributionDocument year={year} territories={territories} />}
          fileName={`S-13_F-${year}.pdf`}
        >
          {children ?? <ArrowDownTrayIcon className="inline size-6 text-teal-600" />}
        </PDFDownloadLink>
      )}
    </>
  )
}
