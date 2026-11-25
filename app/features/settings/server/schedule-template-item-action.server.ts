import { parseWithZod } from '@conform-to/zod/v4'
import { data } from 'react-router'
import { ScheduleKind } from '~/features/events'
import {
  makeRoomAtTemplateOrder,
  mergeLoneHalls,
  renameTemplateHall,
  renameTemplateSection,
  splitSectionIntoHalls,
  templatePartSection,
} from '~/features/events/index.server'
import { renameHallSchema, renameSectionSchema } from '~/features/settings/schemas/schedule-template.schema'
import { upsertPartSchema } from '~/features/settings/schemas/template.schema'
import * as m from '~/i18n/paraglide/messages'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { getScheduleTemplateItems } from './schedule-template-items.queries'
import {
  handleTemplateItemAction,
  TEMPLATE_ITEM_INTENTS,
  type TemplateActionResult,
} from './template-item-action.server'

/** A programme template's sections and halls, renamed across their parts. */
const SECTION_INTENTS = ['rename-section', 'rename-hall'] as const

const logger = createLogger('schedule-template-items')

/** Every intent that writes a schedule template's items, on either sort. */
export const SCHEDULE_TEMPLATE_ITEM_INTENTS: readonly string[] = [
  ...TEMPLATE_ITEM_INTENTS.part,
  ...TEMPLATE_ITEM_INTENTS.service,
  ...SECTION_INTENTS,
]

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
): Promise<TemplateActionResult | null> {
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
      : TEMPLATE_ITEM_INTENTS.service
  if (!own.includes(intent)) {
    logger.warn('handleScheduleTemplateItem: an intent of the other sort', { scheduleTemplateId, intent, ...actor })
    return refused([m.settings_template_item_not_in_template()])
  }
  const { congregationId, id: actorId } = actor

  if (intent === 'rename-section' || intent === 'rename-hall') {
    const submission = parseWithZod(formData, {
      schema: intent === 'rename-section' ? renameSectionSchema : renameHallSchema,
    })
    if (submission.status !== 'success') {
      logger.warn('handleScheduleTemplateItem: an invalid rename', { scheduleTemplateId, intent, ...actor })
      return { kind: 'refused', response: data(submission.reply(), { status: 400 }) }
    }
    const value = submission.value
    const target = { templateId: items.kindId, scheduleTemplateId }
    const isSection = value.intent === 'rename-section'
    const outcome =
      value.intent === 'rename-section'
        ? await renameTemplateSection(db, target, value.from, value.to, congregationId, actorId)
        : await renameTemplateHall(db, target, value.section, value.from, value.to, congregationId, actorId)
    if (outcome !== 'renamed') {
      logger.warn('handleScheduleTemplateItem: a rename refused', { scheduleTemplateId, intent, outcome, ...actor })
      if (outcome === 'blank') return refused([m.settings_schedule_templates_name_blank()])
      if (outcome === 'unchanged') return refused([m.settings_schedule_templates_name_unchanged()])
      if (outcome === 'taken') {
        return refused([
          isSection ? m.settings_schedule_templates_section_taken() : m.settings_schedule_templates_hall_taken(),
        ])
      }
      return refused(
        [isSection ? m.settings_schedule_templates_section_gone() : m.settings_schedule_templates_hall_gone()],
        409,
      )
    }
    return {
      kind: 'saved',
      message:
        value.intent === 'rename-section'
          ? m.settings_schedule_templates_section_renamed()
          : m.settings_schedule_templates_hall_renamed(),
    }
  }

  const target = { templateId: items.kindId, scheduleTemplateId }
  // The sections a part write touches: where the part was (an edit, a delete) and where it goes.
  const touched: string[] = []
  const partId = Number(formData.get('partId'))
  if ((intent === 'upsert-part' || intent === 'delete-part') && Number.isInteger(partId) && partId > 0) {
    const was = await templatePartSection(db, items.kindId, partId, congregationId)
    if (was != null) touched.push(was)
  }
  if (intent === 'upsert-part') {
    const submission = parseWithZod(formData, { schema: upsertPartSchema })
    if (submission.status === 'success') {
      const { partOrder, partSection, partTrack } = submission.value
      touched.push(partSection)
      // A new part goes where it was added (the end of its section or hall): the parts after it make room. One
      // starting a section's first parallel hall turns its parts outside any hall into the main hall first.
      if (!formData.get('partId')) {
        if (partTrack !== '') {
          const mainHall = m.settings_schedule_templates_main_hall()
          await splitSectionIntoHalls(db, target, partSection, mainHall, congregationId, actorId)
        }
        await makeRoomAtTemplateOrder(db, items.kindId, partOrder, congregationId)
      }
    }
  }
  const result = (await handleTemplateItemAction(db, items.kindId, formData, actor)) ?? null
  // A section left with one hall is no longer in parallel: its parts go back outside any hall.
  if (result?.kind === 'saved' && touched.length > 0) {
    await mergeLoneHalls(db, target, touched, congregationId, actorId)
  }
  return result
}
