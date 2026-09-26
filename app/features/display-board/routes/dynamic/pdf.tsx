import { redirect } from 'react-router'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { isPrintableDynamicDocument } from '~/features/display-board/model/printable-document'
import { programmePdfOptions } from '~/features/display-board/model/programme-pdf-options'
import { getDynamicDocumentData } from '~/features/display-board/server/dynamic-documents.server'
import { filterDynamicDataToEvent, readEventIdParam } from '~/features/display-board/server/event-filter.server'
import { buildSectionVisibilityFilter } from '~/features/display-board/server/section-visibility.server'
import { OrganigramDocument } from '~/features/display-board/ui/dynamic/OrganigramDocument'
import { PioneersDocument } from '~/features/display-board/ui/dynamic/PioneersDocument'
import { PublisherGroupsDocument } from '~/features/display-board/ui/dynamic/PublisherGroupsDocument'
import { EventBoardDocument } from '~/features/events/index.server'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { renderPdfResponse, sanitizeFilename } from '~/shared/infra/pdf.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/pdf'

/**
 * The printable sheet of a dynamic document, guarded exactly like the viewer: board permission
 * plus the section's own visibility — a PDF URL must not show anyone a document the board itself
 * would not. It reads the same data as the viewer, so both show the same people and events.
 */
export function loader({ params, request, context }: Route.LoaderArgs) {
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

    const rawData = await getDynamicDocumentData(db, settings.dynamicType, settings.dynamicRef, congregationId, {
      showServices: settings.showServices,
      dynamicConfig: settings.dynamicConfig,
    })
    // A viewer opened on one event (notification deep link) downloads that event, not the month.
    const { data } = filterDynamicDataToEvent(rawData, readEventIdParam(request))
    if (!data) {
      // Not an empty document but an unreadable one: an unknown type, or a stored config that no
      // longer parses. The viewer shows its empty state too, so leave a trace for whoever looks.
      logger.warn(`Board PDF refused: no data for dynamic document ${settings.id} (type ${settings.dynamicType}).`)
      throw redirect('/board')
    }
    // Same rule as the viewer's download button: an empty document would print a blank page.
    if (!isPrintableDynamicDocument(data)) throw redirect('/board')

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
    if (data.type === DynamicType.Programme) {
      // The programme prints on the programmes export sheet, with the board document's own
      // template choices. Its guard stays the board's, not `CanViewPrograms`: the sheet shows
      // nothing this account cannot already read on the board screen.
      const { configMap, groupBy } = programmePdfOptions(data)
      return renderPdfResponse(
        <EventBoardDocument
          events={data.events}
          configMap={configMap}
          groupBy={groupBy}
          title={title}
          congregationName={congregationName}
        />,
        filename('programme'),
      )
    }
    // Every dynamic type has a sheet: a new type must get one here before it compiles.
    const unhandled: never = data
    return unhandled
  })
}
