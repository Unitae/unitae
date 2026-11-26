import { redirect } from 'react-router'
import { mayOpenEvent, maySeeSchedule } from '~/features/events/model/programme-access'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import { buildStudentSlip, isStudentSlipPart } from '~/features/events/model/student-slip'
import { getEventProgramme } from '~/features/events/server/event-part-assignments.server'
import { canChangeEvent, canFillSchedule, canPublishEvent } from '~/features/events/server/schedule-rights.server'
import { StudentSlipDocument } from '~/features/events/ui/pdf/StudentSlipDocument'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { isDemoCongregation } from '~/shared/domain/demo-mode.server'
import { renderPdfResponse, sanitizeFilename } from '~/shared/infra/pdf.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/part-slip'

// The S-89 of one student part, printed from the event page's share control. Its guards are the page's own: the
// reader may see the programme and fill its parts (canFillSchedule), the programme is published, and the part is a
// student's. Any other request goes back to the event page, and no document is rendered.
export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  requirePermission(permissions, Permission.CanViewPrograms)

  const eventId = requireParamId(params.eventId, '/programs')
  const partId = requireParamId(params.partId, `/programs/events/${eventId}`)
  const backTo = `/programs/events/${eventId}`
  const congregation = context.get(congregationContext)

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await getEventProgramme(db, eventId, congregationId)
    if (!event) throw redirect('/programs')

    const [canEdit, canPublish, canAssign, canAssignService] = await Promise.all([
      canChangeEvent(db, can, currentUser.id, event, congregationId),
      canPublishEvent(db, can, currentUser.id, event, congregationId),
      canFillSchedule(db, can, currentUser.id, event, 'part', congregationId),
      canFillSchedule(db, can, currentUser.id, event, 'service', congregationId),
    ])
    const rights = { canEdit, canPublish, canAssign, canAssignService }
    if (!mayOpenEvent(event.status, rights)) throw redirect('/programs')

    const programme = event.schedules.find(schedule => schedule.kind === ScheduleKind.Programme)
    if (!programme || !maySeeSchedule(programme, rights) || !canAssign) throw redirect(backTo)

    const part = event.eventParts.find(each => each.id === partId)
    if (!part || !isStudentSlipPart(part, event)) throw redirect(backTo)

    const slip = buildStudentSlip({
      event,
      part,
      parts: event.eventParts,
      timezone: congregation.timezone,
      locale: getLocale(),
    })
    const who = slip.name ? `-${sanitizeFilename(slip.name)}` : ''
    const filename = `${m.slip_pdf_filename()}${who}.pdf`

    return renderPdfResponse(<StudentSlipDocument slip={slip} />, filename, {
      demo: isDemoCongregation(congregation),
    })
  })
}
