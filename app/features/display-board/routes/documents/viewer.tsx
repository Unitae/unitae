import { ArrowLeft, Download } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { markDocumentAsViewed } from '~/features/display-board/server/board-document.server'
import { PdfViewer } from '~/features/display-board/ui/PdfViewer'
import * as m from '~/i18n/paraglide/messages'
import { userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Button } from '~/shared/ui/button'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/viewer'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_viewer_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
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

export default function ViewerPage({ loaderData }: Route.ComponentProps) {
  const { document } = loaderData
  const pdfUrl = `/board/documents/${document.id}/view`
  const downloadName = `${document.title}.pdf`

  return (
    <div className="-mx-4 flex h-full min-h-0 flex-col overflow-hidden md:-mx-6">
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
          <a href={pdfUrl} download={downloadName}>
            <Download className="mr-2 size-4" />
            <span className="max-sm:sr-only">{m.board_viewer_download()}</span>
          </a>
        </Button>
      </div>

      <PdfViewer url={pdfUrl} downloadUrl={pdfUrl} downloadName={downloadName} />
    </div>
  )
}
