import { parseWithZod } from '@conform-to/zod/v4'
import { createScheduleTemplate } from '~/features/events/index.server'
import { createScheduleTemplateSchema } from '~/features/settings/schemas/schedule-template.schema'
import * as m from '~/i18n/paraglide/messages'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('schedule-template-create')

/** « Nouveau modèle »: the template created, or why not, in words for the dialog. */
export type CreateScheduleTemplateResult = { ok: true; id: number } | { ok: false; errors: string[] }

/** Creates a schedule template from « Nouveau modèle » on « Modèles de planning » (6a-1c-2). */
export async function handleCreateScheduleTemplate(
  db: TransactionClient,
  formData: FormData,
  actor: { id: number; congregationId: number },
): Promise<CreateScheduleTemplateResult> {
  const submission = parseWithZod(formData, { schema: createScheduleTemplateSchema })
  if (submission.status !== 'success') {
    return { ok: false, errors: Object.values(submission.reply().error ?? {}).flatMap(messages => messages ?? []) }
  }
  const { name, kind, responsibleRoleId } = submission.value
  const result = await createScheduleTemplate(db, { name, kind, responsibleRoleId }, actor.congregationId, actor.id)
  if (result.ok) return result
  logger.warn('handleCreateScheduleTemplate: refused', { reason: result.reason, ...actor })
  return { ok: false, errors: [refusalMessage(result.reason)] }
}

/** Why a template's name or responsible was refused, in words: on creation and on « Enregistrer » alike. */
export function refusalMessage(reason: 'name' | 'role' | 'taken'): string {
  if (reason === 'name') return m.settings_schedule_templates_error_name()
  if (reason === 'taken') return m.settings_schedule_templates_error_name_taken()
  return m.settings_schedule_templates_error_role()
}
