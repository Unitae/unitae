import { redirect } from 'react-router'
import { defaultAppearance } from '~/features/display-board/model/board-appearance'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { isPrintableDynamicDocument } from '~/features/display-board/model/printable-document'
import { sheetDataFor } from '~/features/display-board/model/programme-sheet-window'
import { getDynamicDocumentData } from '~/features/display-board/server/dynamic-documents.server'
import { filterDynamicDataToEvent, readEventIdParam } from '~/features/display-board/server/event-filter.server'
import { buildSectionVisibilityFilter } from '~/features/display-board/server/section-visibility.server'
import { buildBoardSheet } from '~/features/display-board/ui/dynamic/pdf/board-sheet'
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

const FALLBACK_FILENAMES: Record<DynamicType, string> = {
  [DynamicType.Organigram]: 'organigramme',
  [DynamicType.PublisherGroups]: 'groupes',
  [DynamicType.Pioneers]: 'pionniers',
  [DynamicType.Programme]: 'programme',
}

/**
 * The printable sheet of a dynamic document, guarded exactly like the viewer: board permission
 * plus the section's own visibility — a PDF URL must not show anyone a document the board itself
 * would not. It reads the same data as the viewer, so both show the same people and events; the
 * programme prints this month and the next.
 */
export function loader({ params, request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanViewBoard)
  const currentUser = context.get(currentAccountContext)
  // The resolved public name (displayName ?? name) — what every header shows. On managed
  // hosting the raw `Congregation.name` is the provisioning-time value, not the chosen one.
  const { displayName: congregationName, timezone } = context.get(congregationContext)
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
    const eventId = readEventIdParam(request)
    const { data: filtered, requestedEventMissing } = filterDynamicDataToEvent(rawData, eventId)
    if (!filtered) {
      // Not an empty document but an unreadable one: an unknown type, or a stored config that no
      // longer parses. The viewer shows its empty state too, so leave a trace for whoever looks.
      logger.warn(`Board PDF refused: no data for dynamic document ${settings.id} (type ${settings.dynamicType}).`)
      throw redirect('/board')
    }
    const asOf = new Date()
    const data = sheetDataFor(filtered, {
      now: asOf,
      timezone,
      narrowedToEvent: eventId != null && !requestedEventMissing,
    })
    // Same rule as the viewer's download button: an empty document would print a blank page.
    if (!isPrintableDynamicDocument(data)) throw redirect('/board')

    const { title } = settings
    // The programme's guard stays the board's, not `CanViewPrograms`: the sheet shows nothing this
    // account cannot already read on the board screen.
    const sheet = await buildBoardSheet(data, defaultAppearance(data.type), { title, congregationName, asOf, timezone })
    return renderPdfResponse(sheet, `${sanitizeFilename(title.toLowerCase()) || FALLBACK_FILENAMES[data.type]}.pdf`)
  })
}
