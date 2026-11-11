import { parseWithZod } from '@conform-to/zod/v4'
import { data } from 'react-router'
import { isSystemTemplate, partAllowedRolesToWrite } from '~/features/events'
import {
  deleteTemplate,
  deleteTemplatePart,
  deleteTemplateServicePart,
  duplicateTemplate,
  saveTemplateResponsibles,
  templateItemBelongsToTemplate,
  updateTemplate,
  upsertTemplatePart,
  upsertTemplateServicePart,
} from '~/features/events/index.server'
import {
  deletePartSchema,
  deleteServicePartSchema,
  updateTemplateSchema,
  upsertPartSchema,
  upsertServicePartSchema,
} from '~/features/settings/schemas/template.schema'
import * as m from '~/i18n/paraglide/messages'
import { ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface TemplateActor {
  id: number
  congregationId: number
  /** Manages every template: the template's own fields, who runs it, duplicating and deleting it. */
  isManager: boolean
}

/** What an intent did: a toast and, for a duplicate or a delete, where to go; or the form's refusal. */
export type TemplateActionResult =
  | { kind: 'saved'; message: string }
  | { kind: 'moved'; to: string; message: string }
  | { kind: 'refused'; response: ReturnType<typeof data> }

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
    const { name, weekDay, color, startTime, endTime, programmeRoleId, serviceRoleId } = submission.value
    await updateTemplate(db, templateId, { name, weekDay, color, startTime, endTime }, congregationId, actorId)
    if (actor.isManager && programmeRoleId !== undefined && serviceRoleId !== undefined) {
      try {
        await saveTemplateResponsibles(db, templateId, { programmeRoleId, serviceRoleId }, congregationId, actorId)
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error
        return refused(submission.reply({ formErrors: [m.error_forbidden()] }))
      }
    }
    return { kind: 'saved', message: m.settings_template_saved() }
  }

  if (intent === 'upsert-part') {
    const submission = parseWithZod(formData, { schema: upsertPartSchema })
    if (submission.status !== 'success') return refused(submission.reply())
    const value = submission.value
    if (
      value.partId != null &&
      !(await templateItemBelongsToTemplate(db, 'part', value.partId, templateId, congregationId))
    ) {
      return refused(submission.reply({ formErrors: [m.settings_template_item_not_in_template()] }))
    }
    await upsertTemplatePart(
      db,
      templateId,
      {
        id: value.partId,
        name: value.partName,
        section: value.partSection,
        track: value.partTrack,
        trackOrder: value.partTrackOrder ?? null,
        order: value.partOrder,
        durationMin: value.partDuration ?? null,
        allowExternalSpeaker: value.partAllowExternalSpeaker,
        speakerLabel: value.partSpeakerLabel ?? null,
        readerLabel: value.partReaderLabel ?? null,
        presetId: value.partPresetId,
        ...partAllowedRolesToWrite({
          managedSlots: value.managedRoleSlots,
          allowedSpeakerRoleIds: value.allowedSpeakerRoleIds,
          allowedReaderRoleIds: value.allowedReaderRoleIds,
        }),
      },
      congregationId,
      actorId,
    )
    const message = value.partId ? m.settings_template_edit_part_updated() : m.settings_template_edit_part_added()
    return { kind: 'saved', message }
  }

  if (intent === 'delete-part') {
    const submission = parseWithZod(formData, { schema: deletePartSchema })
    if (submission.status !== 'success') return refused(submission.reply())
    if (!(await templateItemBelongsToTemplate(db, 'part', submission.value.partId, templateId, congregationId))) {
      return refused(submission.reply({ formErrors: [m.settings_template_item_not_in_template()] }))
    }
    await deleteTemplatePart(db, submission.value.partId, congregationId)
    return { kind: 'saved', message: m.settings_template_edit_part_deleted() }
  }

  if (intent === 'upsert-service-role') {
    const submission = parseWithZod(formData, { schema: upsertServicePartSchema })
    if (submission.status !== 'success') return refused(submission.reply())
    const { roleId, roleName, roleKey, allowedRoleIds } = submission.value
    if (roleId != null && !(await templateItemBelongsToTemplate(db, 'service', roleId, templateId, congregationId))) {
      return refused(submission.reply({ formErrors: [m.settings_template_item_not_in_template()] }))
    }
    const key = roleKey || slug(roleName)
    await upsertTemplateServicePart(
      db,
      templateId,
      { id: roleId, name: roleName, key, allowedRoleIds },
      congregationId,
      actorId,
    )
    return {
      kind: 'saved',
      message: roleId ? m.settings_template_edit_service_role_updated() : m.settings_template_edit_service_role_added(),
    }
  }

  if (intent === 'delete-service-role') {
    const submission = parseWithZod(formData, { schema: deleteServicePartSchema })
    if (submission.status !== 'success') return refused(submission.reply())
    if (!(await templateItemBelongsToTemplate(db, 'service', submission.value.roleId, templateId, congregationId))) {
      return refused(submission.reply({ formErrors: [m.settings_template_item_not_in_template()] }))
    }
    await deleteTemplateServicePart(db, submission.value.roleId, congregationId)
    return { kind: 'saved', message: m.settings_template_edit_service_role_deleted() }
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

const NOT_SLUG = /[^a-z0-9-]/g
const SPACES = /\s+/g

/** A service's key from its name, when it has none yet: « Sono 2 » → « sono-2 ». */
function slug(name: string): string {
  return name.toLowerCase().replace(SPACES, '-').replace(NOT_SLUG, '')
}
