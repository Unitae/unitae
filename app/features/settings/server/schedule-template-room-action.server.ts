import { data } from 'react-router'
import { addTemplateRoom, deleteTemplateRoom, renameTemplateRoom } from '~/features/events/index.server'
import * as m from '~/i18n/paraglide/messages'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { TemplateActionResult } from './template-item-action.server'

/** A programme template's rooms, from the « Salles » list of its panel. */
export const ROOM_INTENTS = ['add-room', 'rename-room', 'delete-room'] as const

const logger = createLogger('schedule-template-rooms')

const refused = (formErrors: string[], status = 400): TemplateActionResult => ({
  kind: 'refused',
  response: data({ status: 'error', error: { '': formErrors } }, { status }),
})

/** Adds, renames or deletes one of a programme template's rooms; the template is the congregation's (its caller read it). */
export async function handleRoomIntent(
  db: TransactionClient,
  scheduleTemplateId: number,
  formData: FormData,
  actor: { id: number; congregationId: number },
): Promise<TemplateActionResult> {
  const intent = String(formData.get('intent'))
  const name = String(formData.get('name') ?? '')
  const { congregationId, id: actorId } = actor

  if (intent === 'add-room') {
    const added = await addTemplateRoom(db, scheduleTemplateId, name, congregationId, actorId)
    if (added.outcome === 'added') return { kind: 'saved', message: m.settings_schedule_templates_room_added() }
    logger.warn('handleRoomIntent: a room not added', { scheduleTemplateId, outcome: added.outcome, ...actor })
    if (added.outcome === 'blank') return refused([m.settings_schedule_templates_name_blank()])
    if (added.outcome === 'taken') return refused([m.settings_schedule_templates_room_taken()])
    return refused([m.settings_schedule_templates_room_gone()], 409)
  }

  const roomId = Number(formData.get('roomId'))
  if (!Number.isInteger(roomId) || roomId <= 0) {
    logger.warn('handleRoomIntent: an unreadable room', { scheduleTemplateId, intent, ...actor })
    return refused([m.settings_schedule_templates_room_gone()])
  }

  if (intent === 'rename-room') {
    const outcome = await renameTemplateRoom(db, scheduleTemplateId, roomId, name, congregationId, actorId)
    if (outcome === 'renamed') return { kind: 'saved', message: m.settings_schedule_templates_room_renamed() }
    logger.warn('handleRoomIntent: a room not renamed', { scheduleTemplateId, roomId, outcome, ...actor })
    if (outcome === 'blank') return refused([m.settings_schedule_templates_name_blank()])
    if (outcome === 'unchanged') return refused([m.settings_schedule_templates_name_unchanged()])
    if (outcome === 'taken') return refused([m.settings_schedule_templates_room_taken()])
    return refused([m.settings_schedule_templates_room_gone()], 409)
  }

  const outcome = await deleteTemplateRoom(db, scheduleTemplateId, roomId, congregationId, actorId)
  if (outcome === 'deleted') return { kind: 'saved', message: m.settings_schedule_templates_room_deleted() }
  logger.warn('handleRoomIntent: a room not deleted', { scheduleTemplateId, roomId, outcome, ...actor })
  if (outcome === 'main') return refused([m.settings_schedule_templates_room_main_stays()])
  return refused([m.settings_schedule_templates_room_gone()], 409)
}
