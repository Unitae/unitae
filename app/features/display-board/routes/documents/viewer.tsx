import { ArrowLeft, Download } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { markDocumentAsViewed } from '~/features/display-board/server/board-document.server'
import { buildSectionVisibilityFilter } from '~/features/display-board/server/section-visibility.server'
import { PdfViewer } from '~/features/display-board/ui/PdfViewer'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/viewer'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_viewer_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanViewBoard)

  const currentUser = context.get(currentAccountContext)

  const documentId = requireParamId(params.documentId, '/board')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    // Visibility first: marking a document read would otherwise be a side
    // effect of a request the viewer was never entitled to make.
    const visible = await db.boardDocument.findFirst({
      where: {
        id: documentId,
        congregationId,
        section: await buildSectionVisibilityFilter(db, currentUser.id, congregationId),
      },
      select: { id: true },
    })
    if (!visible) {
      logger.warn(`Document ID: ${documentId} not visible. User ID: ${currentUser.id}.`)
      throw redirect('/board')
    }

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
    <div data-full-bleed="" className="-m-4 flex h-[calc(100vh-2rem)] flex-col md:-m-6 md:h-[calc(100vh-3rem)]">
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
