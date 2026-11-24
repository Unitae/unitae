import { data } from 'react-router'
import { ScheduleKind } from '~/features/events'
import * as m from '~/i18n/paraglide/messages'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getScheduleTemplateItems } from './schedule-template-items.queries'
import {
  handleTemplateItemAction,
  TEMPLATE_ITEM_INTENTS,
  type TemplateActionResult,
} from './template-item-action.server'

/** Every intent that writes a schedule template's items, on either sort. */
export const SCHEDULE_TEMPLATE_ITEM_INTENTS: readonly string[] = [
  ...TEMPLATE_ITEM_INTENTS.part,
  ...TEMPLATE_ITEM_INTENTS.service,
]

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
  const own: readonly string[] =
    items.kind === ScheduleKind.Programme ? TEMPLATE_ITEM_INTENTS.part : TEMPLATE_ITEM_INTENTS.service
  if (!own.includes(String(formData.get('intent')))) {
    return {
      kind: 'refused',
      response: data({ status: 'error', error: { '': [m.settings_template_item_not_in_template()] } }, { status: 400 }),
    }
  }
  return (await handleTemplateItemAction(db, items.kindId, formData, actor)) ?? null
}
