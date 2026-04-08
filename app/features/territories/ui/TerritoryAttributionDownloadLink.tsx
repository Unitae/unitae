import { PDFDownloadLink } from '@react-pdf/renderer'
import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Attribution, Territory, User } from '~/database/generated/client'
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
          {children ?? <Download className="inline size-5 text-primary" />}
        </PDFDownloadLink>
      )}
    </>
  )
}
