import { deleteScheduleTemplate } from '~/features/events/index.server'
import * as m from '~/i18n/paraglide/messages'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('schedule-template-delete')

/** « Supprimer le modèle »: deleted, or why not, in words for the panel. */
export type DeleteScheduleTemplateResult = { ok: true } | { ok: false; errors: string[] }

/** Deletes the schedule template the panel is open on (`?template=`), from « Modèles de planning ». */
export async function handleDeleteScheduleTemplate(
  db: TransactionClient,
  templateParam: string | null,
  actor: { id: number; congregationId: number },
): Promise<DeleteScheduleTemplateResult> {
  const scheduleTemplateId = Number(templateParam)
  const gone = { ok: false as const, errors: [m.settings_schedule_templates_error_vanished()] }
  if (!Number.isInteger(scheduleTemplateId) || scheduleTemplateId <= 0) return gone
  const deleted = await deleteScheduleTemplate(db, scheduleTemplateId, actor.congregationId, actor.id)
  if (deleted == null) {
    logger.warn('handleDeleteScheduleTemplate: no such schedule template', { scheduleTemplateId, ...actor })
    return gone
  }
  return { ok: true }
}
