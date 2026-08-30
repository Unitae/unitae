import { redirect } from 'react-router'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { fetchOrganigramDocument } from '~/features/display-board/server/organigram-document.server'
import { buildSectionVisibilityFilter } from '~/features/display-board/server/section-visibility.server'
import { OrganigramDocument } from '~/features/display-board/ui/dynamic/OrganigramDocument'
import {
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
 * The printable sheet, guarded exactly like the viewer: board permission plus the section's
 * own visibility — a PDF URL must not show anyone a document the board itself would not.
 */
export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanViewBoard)
  const currentUser = context.get(currentAccountContext)
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
    if (!settings || settings.dynamicType !== DynamicType.Organigram) throw redirect('/board')

    const [tree, congregation] = await Promise.all([
      fetchOrganigramDocument(db, congregationId),
      db.congregation.findFirst({ where: { id: congregationId }, select: { name: true } }),
    ])

    return renderPdfResponse(
      <OrganigramDocument tree={tree} title={settings.title} congregationName={congregation?.name ?? ''} />,
      `${sanitizeFilename(settings.title.toLowerCase()) || 'organigramme'}.pdf`,
    )
  })
}
