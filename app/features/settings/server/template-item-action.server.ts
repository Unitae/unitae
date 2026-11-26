import { parseWithZod } from '@conform-to/zod/v4'
import { data } from 'react-router'
import { partAllowedRolesToWrite } from '~/features/events'
import {
  deleteTemplatePart,
  deleteTemplateServicePart,
  type ItemOwner,
  templateItemBelongsToTemplate,
  upsertTemplatePart,
  upsertTemplateServicePart,
} from '~/features/events/index.server'
import {
  deletePartSchema,
  deleteServicePartSchema,
  upsertPartSchema,
  upsertServicePartSchema,
} from '~/features/settings/schemas/template.schema'
import * as m from '~/i18n/paraglide/messages'
import type { TransactionClient } from '~/shared/infra/db.server'

/** What an intent did: a toast, where to go (the type page's duplicate or delete), or the form's refusal. */
export type TemplateActionResult =
  | { kind: 'saved'; message: string }
  | { kind: 'moved'; to: string; message: string }
  | { kind: 'refused'; response: ReturnType<typeof data> }

/** The intents that write a template's items: its parts, or its services. */
export const TEMPLATE_ITEM_INTENTS = {
  part: ['upsert-part', 'delete-part'],
  service: ['upsert-service-role', 'delete-service-role'],
} as const

const refused = (reply: unknown, status = 400): TemplateActionResult => ({
  kind: 'refused',
  response: data(reply, { status }),
})

/**
 * A template's parts and services, written for a kind (its page) or a schedule template (« Modèles de planning »): a
 * part or a service id must belong to the owner, since the writers find a row by its id alone. Undefined for an intent
 * that is not an item's: the caller handles it.
 */
export async function handleTemplateItemAction(
  db: TransactionClient,
  owner: ItemOwner,
  formData: FormData,
  actor: { id: number; congregationId: number },
): Promise<TemplateActionResult | undefined> {
  const intent = formData.get('intent')
  const { congregationId, id: actorId } = actor

  if (intent === 'upsert-part') {
    const submission = parseWithZod(formData, { schema: upsertPartSchema })
    if (submission.status !== 'success') return refused(submission.reply())
    const value = submission.value
    if (
      value.partId != null &&
      !(await templateItemBelongsToTemplate(db, 'part', value.partId, owner, congregationId))
    ) {
      return refused(submission.reply({ formErrors: [m.settings_template_item_not_in_template()] }))
    }
    await upsertTemplatePart(
      db,
      owner,
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
        // « Où » on « Modèles de planning »; the meeting type's form has no such field and leaves the rooms be.
        roomIds: value.partRoomsManaged ? value.partRooms : undefined,
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
    if (!(await templateItemBelongsToTemplate(db, 'part', submission.value.partId, owner, congregationId))) {
      return refused(submission.reply({ formErrors: [m.settings_template_item_not_in_template()] }))
    }
    await deleteTemplatePart(db, submission.value.partId, congregationId)
    return { kind: 'saved', message: m.settings_template_edit_part_deleted() }
  }

  if (intent === 'upsert-service-role') {
    const submission = parseWithZod(formData, { schema: upsertServicePartSchema })
    if (submission.status !== 'success') return refused(submission.reply())
    const { roleId, roleName, roleKey, allowedRoleIds } = submission.value
    if (roleId != null && !(await templateItemBelongsToTemplate(db, 'service', roleId, owner, congregationId))) {
      return refused(submission.reply({ formErrors: [m.settings_template_item_not_in_template()] }))
    }
    const key = roleKey || slug(roleName)
    await upsertTemplateServicePart(
      db,
      owner,
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
    if (!(await templateItemBelongsToTemplate(db, 'service', submission.value.roleId, owner, congregationId))) {
      return refused(submission.reply({ formErrors: [m.settings_template_item_not_in_template()] }))
    }
    await deleteTemplateServicePart(db, submission.value.roleId, congregationId)
    return { kind: 'saved', message: m.settings_template_edit_service_role_deleted() }
  }

  return undefined
}

const NOT_SLUG = /[^a-z0-9-]/g
const SPACES = /\s+/g

/** A service's key from its name, when it has none yet: « Sono 2 » → « sono-2 ». */
function slug(name: string): string {
  return name.toLowerCase().replace(SPACES, '-').replace(NOT_SLUG, '')
}
