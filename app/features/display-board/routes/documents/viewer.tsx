import { ArrowLeft, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, redirect } from 'react-router'
import { markDocumentAsViewed } from '~/features/display-board/server/board-document.server'
import { PdfViewer } from '~/features/display-board/ui/PdfViewer'
import * as m from '~/paraglide/messages'
import { userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import logger from '~/shared/infra/logger.server'
import { requireParamId } from '~/shared/utils/params.server'
import { Button } from '~/shared/ui/button'

import type { Route } from './+types/viewer'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_viewer_meta_title() }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const currentUser = context.get(userContext)

  const documentId = requireParamId(params.documentId, '/board')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const document = await markDocumentAsViewed(db, documentId, currentUser.id, congregationId)

    if (!document) {
      logger.warn(`Document ID: ${documentId} not found. User ID: ${currentUser.id}.`)
      throw redirect('/board')
    }

    return { document }
  })
}

const ANDROID_UA_REGEX = /android/i

function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return ANDROID_UA_REGEX.test(navigator.userAgent)
}

// PDF open parameters to hide the browser's default PDF viewer chrome.
// Supported by Chrome/Edge (PDFium) and partially by Firefox. Safari ignores them.
const PDF_VIEWER_PARAMS = '#toolbar=0&navpanes=0&scrollbar=1&view=FitH'

export default function ViewerPage({ loaderData }: Route.ComponentProps) {
  const { document } = loaderData
  const pdfUrl = `/board/documents/${document.id}/view`
  const embedUrl = `${pdfUrl}${PDF_VIEWER_PARAMS}`
  const [useFallback, setUseFallback] = useState(false)

  useEffect(() => {
    setUseFallback(isAndroidDevice())
  }, [])

  return (
    <div className="-m-4 md:-m-6 flex h-[calc(100vh-2rem)] flex-col md:h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between gap-2 border-b bg-background px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/board" title={m.board_viewer_back()}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <h1 className="truncate font-semibold text-sm">{document.title}</h1>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={pdfUrl} download={`${document.title}.pdf`}>
            <Download className="mr-2 size-4" />
            <span className="max-sm:sr-only">{m.board_viewer_download()}</span>
          </a>
        </Button>
      </div>

      {useFallback ? (
        <PdfViewer url={pdfUrl} />
      ) : (
        <div className="flex flex-1 justify-center bg-muted/30 p-4 md:p-6">
          <object data={embedUrl} type="application/pdf" className="h-full w-full max-w-4xl rounded-md shadow-sm">
            <PdfViewer url={pdfUrl} />
          </object>
        </div>
      )}
    </div>
  )
}
