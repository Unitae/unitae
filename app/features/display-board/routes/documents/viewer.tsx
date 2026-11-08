import { Download } from 'lucide-react'
import { redirect } from 'react-router'
import { markDocumentAsViewed } from '~/features/display-board/server/board-document.server'
import { findViewableDocument } from '~/features/display-board/server/board-reading.queries'
import { BoardViewerHeader, formatViewerDate } from '~/features/display-board/ui/BoardViewerHeader'
import { PdfViewer } from '~/features/display-board/ui/PdfViewer'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
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
  const { timezone } = context.get(congregationContext)
  const documentId = requireParamId(params.documentId, '/board')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    // Visibility first: marking a document read would otherwise be a side
    // effect of a request the viewer was never entitled to make.
    const document = await findViewableDocument(db, { documentId, userId: currentUser.id, congregationId })
    if (!document) {
      logger.warn(`Document ID: ${documentId} not visible. User ID: ${currentUser.id}.`)
      throw redirect('/board')
    }

    await markDocumentAsViewed(db, documentId, currentUser.id, congregationId)

    return { document, timeZone: timezone }
  })
}

export default function ViewerPage({ loaderData }: Route.ComponentProps) {
  const { document, timeZone } = loaderData
  const pdfUrl = `/board/documents/${document.id}/view`
  const downloadName = `${document.title}.pdf`
  const date = (value: Date) => formatViewerDate(value, timeZone)

  return (
    <div data-full-bleed="" className="-m-4 flex h-[calc(100vh-2rem)] flex-col md:-m-6 md:h-[calc(100vh-3rem)]">
      <BoardViewerHeader
        sectionName={document.sectionName}
        title={document.title}
        facts={[
          m.board_viewer_added_on({ date: date(document.createdAt) }),
          ...(document.replacedAt ? [m.board_viewer_replaced_on({ date: date(document.replacedAt) })] : []),
          ...(document.visibleUntil ? [m.board_viewer_shown_until({ date: date(document.visibleUntil) })] : []),
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <a href={pdfUrl} download={downloadName}>
              <Download className="size-4" aria-hidden="true" />
              {m.board_viewer_download()}
            </a>
          </Button>
        }
      />

      <PdfViewer url={pdfUrl} downloadUrl={pdfUrl} downloadName={downloadName} />
    </div>
  )
}
