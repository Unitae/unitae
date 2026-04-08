import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { useEffect, useState } from 'react'
import type { PublisherActivity, User } from '~/database/generated/client'
import { PublisherActivityDocument } from './PublisherActivityDocument'

export function PublisherActivityDownloadLink({
  publisher,
  children,
}: {
  publisher: Omit<User, 'password'> & { activities: PublisherActivity[] }
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
          document={<PublisherActivityDocument publisher={publisher} />}
          fileName={`S-21_F-${publisher.firstname}-${publisher.lastname}.pdf`}
        >
          {children ?? <ArrowDownTrayIcon className="inline size-6 text-teal-600" />}
        </PDFDownloadLink>
      )}
    </>
  )
}
