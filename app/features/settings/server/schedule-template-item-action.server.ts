import { parseWithZod } from '@conform-to/zod/v4'
import { data } from 'react-router'
import { ScheduleKind } from '~/features/events'
import {
  makeRoomAtTemplateOrder,
  renameTemplateHall,
  renameTemplateSection,
  splitSectionIntoHalls,
} from '~/features/events/index.server'
import { renameHallSchema, renameSectionSchema } from '~/features/settings/schemas/schedule-template.schema'
import { upsertPartSchema } from '~/features/settings/schemas/template.schema'
import * as m from '~/i18n/paraglide/messages'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getScheduleTemplateItems } from './schedule-template-items.queries'
import {
  handleTemplateItemAction,
  TEMPLATE_ITEM_INTENTS,
  type TemplateActionResult,
} from './template-item-action.server'

/** A programme template's sections and halls, renamed across their parts. */
const SECTION_INTENTS = ['rename-section', 'rename-hall'] as const

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
 * template is not the congregation's or no kind uses it: nothing to write through.
 */
export async function handleScheduleTemplateItem(
  db: TransactionClient,
  scheduleTemplateId: number,
  formData: FormData,
  actor: { id: number; congregationId: number },
): Promise<TemplateActionResult | null> {
  const items = await getScheduleTemplateItems(db, scheduleTemplateId, actor.congregationId)
  if (items?.kindId == null) return null
  const intent = String(formData.get('intent'))
  const own: readonly string[] =
    items.kind === ScheduleKind.Programme
      ? [...TEMPLATE_ITEM_INTENTS.part, ...SECTION_INTENTS]
      : TEMPLATE_ITEM_INTENTS.service
  if (!own.includes(intent)) return refused([m.settings_template_item_not_in_template()])
  const { congregationId, id: actorId } = actor

  if (intent === 'rename-section' || intent === 'rename-hall') {
    const submission = parseWithZod(formData, {
      schema: intent === 'rename-section' ? renameSectionSchema : renameHallSchema,
    })
    if (submission.status !== 'success') return { kind: 'refused', response: data(submission.reply(), { status: 400 }) }
    const value = submission.value
    const renamed =
      value.intent === 'rename-section'
        ? await renameTemplateSection(db, items.kindId, value.from, value.to, congregationId, actorId)
        : await renameTemplateHall(db, items.kindId, value.section, value.from, value.to, congregationId, actorId)
    if (renamed === 0) return refused([m.settings_schedule_templates_error_vanished()], 409)
    return {
      kind: 'saved',
      message:
        value.intent === 'rename-section'
          ? m.settings_schedule_templates_section_renamed()
          : m.settings_schedule_templates_hall_renamed(),
    }
  }

  // A new part goes where it was added (the end of its section or hall): the parts after it make room. One starting a
  // parallel hall turns its section's parts outside any hall into the main hall first.
  if (intent === 'upsert-part' && !formData.get('partId')) {
    const submission = parseWithZod(formData, { schema: upsertPartSchema })
    if (submission.status === 'success') {
      const { partOrder, partSection, partTrack } = submission.value
      if (partTrack !== '') {
        await splitSectionIntoHalls(
          db,
          items.kindId,
          partSection,
          m.settings_schedule_templates_main_hall(),
          congregationId,
        )
      }
      await makeRoomAtTemplateOrder(db, items.kindId, partOrder, congregationId)
    }
  }
  return (await handleTemplateItemAction(db, items.kindId, formData, actor)) ?? null
}
