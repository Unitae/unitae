import { PDFDownloadLink } from '@react-pdf/renderer'
import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PublisherActivity, User } from '~/database/generated/client'
import { Button } from '~/shared/ui/button'
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
          {children ?? (
            <Button variant="outline" size="icon" type="button">
              <Download className="size-4" />
            </Button>
          )}
        </PDFDownloadLink>
      )}
    </>
  )
}
