import { PDFViewer } from '@react-pdf/renderer'
import { useEffect, useState } from 'react'
import type { Territory } from '~/database/generated/client'

import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import type { Entrance } from '~/shared/types/entrance'
import { TerritoryDocument } from './TerritoryDocument'

export function TerritoryViewer({
  territory,
  entrances,
  googleMapKey,
  googleMapId,
  showPhone,
  owner,
  restitutionDate,
  attributionType = TerritoryAttributionKind.Default,
}: {
  territory: Territory
  entrances: Entrance[]
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

  return (
    <>
      {shouldShowPdf && (
        <PDFViewer className="flex-1" showToolbar={false}>
          <TerritoryDocument
            name={territory.number}
            type={territory.type}
            entrances={entrances}
            googleMapId={googleMapId}
            googleMapKey={googleMapKey}
            showPhone={showPhone}
            owner={owner}
            restitutionDate={restitutionDate}
            attributionType={attributionType}
          />
        </PDFViewer>
      )}
    </>
  )
}
