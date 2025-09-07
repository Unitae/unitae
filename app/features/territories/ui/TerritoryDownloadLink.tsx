import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import type { Territory } from '~/database/generated/client'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { useEffect, useState } from 'react'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { Entrance } from '~/shared/types/entrance'
import { TerritoryDocument } from './TerritoryDocument'

export function TerritoryDownloadLink({
  territory,
  entrances,
  children,
  googleMapKey,
  googleMapId,
  showPhone,
  owner,
  restitutionDate,
  attributionType = TerritoryAttributionKind.Default,
}: {
  territory: Territory
  entrances: Entrance[]
  children?: React.ReactNode
  googleMapId: string | undefined
  googleMapKey: string | undefined
  showPhone?: boolean
  owner?: string
  restitutionDate?: Date
  attributionType?: TerritoryAttributionKind
}) {
  const [shouldShowPdf, showPdf] = useState(false)

  useEffect(() => {
    showPdf(true)
  }, [])

  const ownerFirstname = owner != null ? (owner.toLowerCase().split(' ').at(0) ?? '') : ''
  return (
    <>
      {shouldShowPdf && (
        <PDFDownloadLink
          document={
            <TerritoryDocument
              name={territory.number}
              type={territory.type as TerritoryKind}
              entrances={entrances}
              googleMapId={googleMapId}
              googleMapKey={googleMapKey}
              showPhone={showPhone}
              owner={owner}
              restitutionDate={restitutionDate}
              attributionType={attributionType}
            />
          }
          fileName={`territoire-${territory.number}${ownerFirstname.length > 0 ? `__${ownerFirstname}` : ''}.pdf`}
        >
          {children ?? <ArrowDownTrayIcon className="inline size-6 text-teal-600" />}
        </PDFDownloadLink>
      )}
    </>
  )
}
