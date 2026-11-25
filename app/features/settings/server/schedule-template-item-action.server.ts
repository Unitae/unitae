import { parseWithZod } from '@conform-to/zod/v4'
import { data } from 'react-router'
import { ScheduleKind } from '~/features/events'
import {
  makeRoomAtTemplateOrder,
  orderAtEndOf,
  placeExists,
  renameTemplateSection,
  reorderTemplateParts,
  reorderTemplateServices,
  templatePartPlace,
} from '~/features/events/index.server'
import { renameSectionSchema } from '~/features/settings/schemas/schedule-template.schema'
import { upsertPartSchema } from '~/features/settings/schemas/template.schema'
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { getScheduleTemplateItems } from './schedule-template-items.queries'
import { handleRoomIntent, ROOM_INTENTS } from './schedule-template-room-action.server'
import {
  handleTemplateItemAction,
  TEMPLATE_ITEM_INTENTS,
  type TemplateActionResult,
} from './template-item-action.server'

/** A programme template's sections, renamed across their parts, its parts' order, and its rooms. */
const SECTION_INTENTS = ['rename-section', 'reorder-parts', ...ROOM_INTENTS] as const
/** A duties template's services' order. */
const SERVICE_ORDER_INTENTS = ['reorder-services'] as const

const logger = createLogger('schedule-template-items')

/** Every intent that writes a schedule template's items, on either sort. */
export const SCHEDULE_TEMPLATE_ITEM_INTENTS: readonly string[] = [
  ...TEMPLATE_ITEM_INTENTS.part,
  ...TEMPLATE_ITEM_INTENTS.service,
  ...SECTION_INTENTS,
  ...SERVICE_ORDER_INTENTS,
]

/** What an item intent did; a reorder shows itself in the list and is said by the page, so it carries no toast. */
export type ScheduleTemplateItemResult = TemplateActionResult | { kind: 'reordered' }

const refused = (formErrors: string[], status = 400): TemplateActionResult => ({
  kind: 'refused',
  response: data({ status: 'error', error: { '': formErrors } }, { status }),
})

/**
 * Writes a schedule template's item from « Modèles de planning »: a programme template's parts, a duties template's
 * services, through the first kind that uses it until its items stop belonging to a kind (6a-1c-2). Null when the
 * template is not the congregation's; refused when no kind uses it, nothing to write through.
 */
export async function handleScheduleTemplateItem(
  db: TransactionClient,
  scheduleTemplateId: number,
  formData: FormData,
  actor: { id: number; congregationId: number },
): Promise<ScheduleTemplateItemResult | null> {
  const items = await getScheduleTemplateItems(db, scheduleTemplateId, actor.congregationId)
  if (items == null) {
    logger.warn('handleScheduleTemplateItem: no such schedule template', { scheduleTemplateId, ...actor })
    return null
  }
  if (items.kindId == null) {
    logger.warn('handleScheduleTemplateItem: no kind uses the schedule template', { scheduleTemplateId, ...actor })
    return {
      kind: 'refused',
      response: data({ status: 'error', error: { '': [m.settings_schedule_templates_no_kind()] } }, { status: 409 }),
    }
  }
  const intent = String(formData.get('intent'))
  const own: readonly string[] =
    items.kind === ScheduleKind.Programme
      ? [...TEMPLATE_ITEM_INTENTS.part, ...SECTION_INTENTS]
      : [...TEMPLATE_ITEM_INTENTS.service, ...SERVICE_ORDER_INTENTS]
  if (!own.includes(intent)) {
    logger.warn('handleScheduleTemplateItem: an intent of the other sort', { scheduleTemplateId, intent, ...actor })
    return refused([m.settings_template_item_not_in_template()])
  }
  const { congregationId, id: actorId } = actor

  // A new order of every part, or every service (« Réorganiser », a drag): exactly the template's, or the list changed
  // meanwhile.
  if (intent === 'reorder-parts' || intent === 'reorder-services') {
    const of = intent === 'reorder-parts' ? 'parts' : 'services'
    const ids = readIds(formData.get('orderedIds'))
    if (ids == null) {
      logger.warn('handleScheduleTemplateItem: an unreadable order', { scheduleTemplateId, of, ...actor })
      return refused([m.settings_schedule_templates_order_stale()])
    }
    const expected = new Set((of === 'parts' ? items.parts : items.services).map(item => item.id))
    const unknown = ids.filter(id => !expected.has(id)).length
    if (ids.length !== expected.size || new Set(ids).size !== ids.length || unknown > 0) {
      logger.warn('handleScheduleTemplateItem: an order that is not the template’s', {
        scheduleTemplateId,
        of,
        sent: ids.length,
        items: expected.size,
        unknown,
        ...actor,
      })
      return refused([m.settings_schedule_templates_order_stale()], 409)
    }
    const written =
      of === 'parts'
        ? await reorderTemplateParts(db, congregationId, items.kindId, ids)
        : await reorderTemplateServices(db, congregationId, items.kindId, ids)
    if (!written) {
      logger.warn('handleScheduleTemplateItem: the order refused at write', { scheduleTemplateId, of, ...actor })
      return refused([m.settings_schedule_templates_order_stale()], 409)
    }
    await auditInTransaction(db, {
      action: AuditAction.ScheduleTemplateUpdated,
      congregationId,
      actorId,
      entityType: 'ScheduleTemplate',
      entityId: scheduleTemplateId,
      metadata: { reordered: of, count: ids.length },
    })
    return { kind: 'reordered' }
  }

  if (ROOM_INTENTS.some(each => each === intent)) {
    return handleRoomIntent(db, scheduleTemplateId, formData, actor)
  }

  if (intent === 'rename-section') {
    const submission = parseWithZod(formData, { schema: renameSectionSchema })
    if (submission.status !== 'success') {
      logger.warn('handleScheduleTemplateItem: an invalid rename', { scheduleTemplateId, intent, ...actor })
      return { kind: 'refused', response: data(submission.reply(), { status: 400 }) }
    }
    const { from, to } = submission.value
    const target = { templateId: items.kindId, scheduleTemplateId }
    const outcome = await renameTemplateSection(db, target, from, to, congregationId, actorId)
    if (outcome !== 'renamed') {
      logger.warn('handleScheduleTemplateItem: a rename refused', { scheduleTemplateId, intent, outcome, ...actor })
      if (outcome === 'blank') return refused([m.settings_schedule_templates_name_blank()])
      if (outcome === 'unchanged') return refused([m.settings_schedule_templates_name_unchanged()])
      if (outcome === 'taken') return refused([m.settings_schedule_templates_section_taken()])
      return refused([m.settings_schedule_templates_section_gone()], 409)
    }
    return { kind: 'saved', message: m.settings_schedule_templates_section_renamed() }
  }

  const partId = Number(formData.get('partId'))
  const was =
    intent === 'upsert-part' && Number.isInteger(partId) && partId > 0
      ? await templatePartPlace(db, items.kindId, partId, congregationId)
      : null
  if (intent === 'upsert-part') {
    // A template part's rooms are its room rows (« Où »), never a track.
    formData.set('partTrack', '')
    formData.delete('partTrackOrder')
    const submission = parseWithZod(formData, { schema: upsertPartSchema })
    if (submission.status === 'success') {
      const { partSection, partRooms, partRoomsManaged } = submission.value
      if (partRoomsManaged && partRooms.some(id => !items.rooms.some(room => room.id === id))) {
        logger.warn('handleScheduleTemplateItem: a room no longer there', { scheduleTemplateId, partId, ...actor })
        return refused([m.settings_schedule_templates_room_gone()], 409)
      }
      const isNew = !formData.get('partId')
      const moved = was != null && was.section !== partSection
      // An edited part is moved among what exists: a section renamed or emptied elsewhere since its form opened is
      // not there any more (a new part may bring its own, from « Ajouter une section »).
      if (moved && !(await placeExists(db, items.kindId, partSection, partId, congregationId))) {
        logger.warn('handleScheduleTemplateItem: a part moved to a section no longer there', {
          scheduleTemplateId,
          partId,
          ...actor,
        })
        return refused([m.settings_schedule_templates_section_gone()], 409)
      }
      // Where it goes, never taken from the form for a part that exists: one edited in place keeps its order, one
      // moved to another section goes to its end; a new part goes where it was added, or to the end of its section
      // when sent without a place. The parts from there on make room.
      const self = was == null ? null : partId
      const sentOrder = String(formData.get('partOrder') ?? '')
      const order =
        was != null && !moved
          ? was.order
          : moved || sentOrder === ''
            ? await orderAtEndOf(db, items.kindId, partSection, self, congregationId)
            : Number(sentOrder)
      formData.set('partOrder', String(order))
      if (isNew || moved) await makeRoomAtTemplateOrder(db, items.kindId, order, congregationId)
    }
  }
  return (await handleTemplateItemAction(db, items.kindId, formData, actor)) ?? null
}

/** The ids a reorder sends, as JSON; null for anything else. */
function readIds(value: FormDataEntryValue | null): number[] | null {
  try {
    const parsed: unknown = JSON.parse(String(value ?? ''))
    return Array.isArray(parsed) && parsed.every(id => Number.isInteger(id) && id > 0) ? parsed : null
  } catch {
    return null
  }
}
