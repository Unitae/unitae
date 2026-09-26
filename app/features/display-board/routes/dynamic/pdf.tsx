import { redirect } from 'react-router'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { isPrintableDynamicDocument } from '~/features/display-board/model/printable-document'
import { getDynamicDocumentData } from '~/features/display-board/server/dynamic-documents.server'
import { buildSectionVisibilityFilter } from '~/features/display-board/server/section-visibility.server'
import { OrganigramDocument } from '~/features/display-board/ui/dynamic/OrganigramDocument'
import { PioneersDocument } from '~/features/display-board/ui/dynamic/PioneersDocument'
import { PublisherGroupsDocument } from '~/features/display-board/ui/dynamic/PublisherGroupsDocument'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { renderPdfResponse, sanitizeFilename } from '~/shared/infra/pdf.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/pdf'

/**
 * The printable sheet of a dynamic document, guarded exactly like the viewer: board permission
 * plus the section's own visibility — a PDF URL must not show anyone a document the board itself
 * would not. It reads the viewer's data, so the sheet and the screen cannot disagree.
 */
export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanViewBoard)
  const currentUser = context.get(currentAccountContext)
  // The resolved public name (displayName ?? name) — what every header shows. On managed
  // hosting the raw `Congregation.name` is the provisioning-time value, not the chosen one.
  const congregationName = context.get(congregationContext).displayName
  const dynamicId = requireParamId(params.dynamicId, '/board')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const settings = await db.boardDynamicDocumentSettings.findFirst({
      where: {
        id: dynamicId,
        congregationId,
        section: await buildSectionVisibilityFilter(db, currentUser.id, congregationId),
      },
    })
    if (!settings) throw redirect('/board')

    const data = await getDynamicDocumentData(db, settings.dynamicType, settings.dynamicRef, congregationId, {
      showServices: settings.showServices,
      dynamicConfig: settings.dynamicConfig,
    })
    // Same rule as the viewer's download button: an empty document would print a blank page.
    if (!data || !isPrintableDynamicDocument(data)) throw redirect('/board')

    const { title } = settings
    const filename = (fallback: string) => `${sanitizeFilename(title.toLowerCase()) || fallback}.pdf`

    if (data.type === DynamicType.Organigram) {
      return renderPdfResponse(
        <OrganigramDocument tree={data.tree} title={title} congregationName={congregationName} />,
        filename('organigramme'),
      )
    }
    if (data.type === DynamicType.PublisherGroups) {
      return renderPdfResponse(
        <PublisherGroupsDocument groups={data.groups} title={title} congregationName={congregationName} />,
        filename('groupes'),
      )
    }
    if (data.type === DynamicType.Pioneers) {
      return renderPdfResponse(
        <PioneersDocument pioneers={data.pioneers} title={title} congregationName={congregationName} />,
        filename('pionniers'),
      )
    }
    throw redirect('/board')
  })
}
