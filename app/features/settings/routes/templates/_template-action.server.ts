import { parseWithZod } from '@conform-to/zod/v4'
import { data } from 'react-router'
import { isSystemTemplate } from '~/features/events'
import { deleteTemplate, duplicateTemplate, moveEmptyMeetings, updateTemplate } from '~/features/events/index.server'
import { updateTemplateSchema } from '~/features/settings/schemas/template.schema'
import {
  handleTemplateItemAction,
  type TemplateActionResult,
} from '~/features/settings/server/template-item-action.server'

export type { TemplateActionResult }

import * as m from '~/i18n/paraglide/messages'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface TemplateActor {
  id: number
  congregationId: number
  /** Manages every template: the template's own fields, who runs it, duplicating and deleting it. */
  isManager: boolean
  /** The congregation's zone, where its meetings' days and hours are read. */
  timeZone: string
}

const refused = (reply: unknown, status = 400): TemplateActionResult => ({
  kind: 'refused',
  response: data(reply, { status }),
})

/**
 * The template page's intents. A built-in template only takes its colour; a part or a service id must belong to this
 * template (a responsible may edit their template, while the writers find a row by its id alone); who runs a template,
 * duplicating and deleting it are for the template managers.
 */
export async function handleTemplateAction(
  db: TransactionClient,
  templateId: number,
  formData: FormData,
  actor: TemplateActor,
): Promise<TemplateActionResult | null> {
  const intent = formData.get('intent')
  const { congregationId, id: actorId } = actor
  const template = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    select: { key: true },
  })
  if (!template) return null
  if (isSystemTemplate(template.key) && intent !== 'update-template') {
    return refused({ status: 'error', error: { '': [m.settings_template_system_locked_intent()] } }, 403)
  }

  if (intent === 'update-template') {
    const submission = parseWithZod(formData, { schema: updateTemplateSchema })
    if (submission.status !== 'success') return refused(submission.reply())
    const { name, weekDay, color, startTime, endTime, attendanceKind } = submission.value
    // How a template counts in attendance is the managers' call, like who runs it.
    const counting = actor.isManager ? { attendanceKind } : {}
    await updateTemplate(
      db,
      templateId,
      { name, weekDay, color, startTime, endTime, ...counting },
      congregationId,
      actorId,
    )
    return { kind: 'saved', message: m.settings_template_saved() }
  }

  const item = await handleTemplateItemAction(db, templateId, formData, actor)
  if (item != null) return item

  // « Déplacer les N réunions à venir »: whoever may change the template's day may bring its meetings along.
  if (intent === 'move-meetings') {
    const { moved, removed } = await moveEmptyMeetings(db, templateId, {
      congregationId,
      timeZone: actor.timeZone,
      now: new Date(),
      actorId,
    })
    const message = [
      moved > 0 && m.settings_template_move_meetings_moved({ count: moved }),
      removed > 0 && m.settings_template_move_meetings_removed({ count: removed }),
    ]
      .filter(Boolean)
      .join(' ')
    return { kind: 'saved', message: message || m.settings_template_move_meetings_none() }
  }

  if (!actor.isManager) return null

  if (intent === 'duplicate') {
    const copy = await duplicateTemplate(db, templateId, congregationId, actorId)
    if (!copy) return null
    return {
      kind: 'moved',
      to: `/settings/templates/${copy.id}`,
      message: m.settings_template_view_duplicate_success({ name: copy.name }),
    }
  }

  if (intent === 'delete') {
    const result = await deleteTemplate(db, templateId, congregationId, actorId)
    if (!result.ok) {
      const message =
        result.reason === 'in-use'
          ? m.settings_template_view_delete_in_use({ count: result.eventCount })
          : m.settings_template_view_delete_error()
      return refused({ status: 'error', error: { '': [message] } }, 409)
    }
    return {
      kind: 'moved',
      to: '/settings/templates',
      message: m.settings_template_view_delete_success({ name: result.name }),
    }
  }

  return null
}
