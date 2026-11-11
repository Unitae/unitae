import { data } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import type { ExternalSpeakerIntent } from '~/features/events/schemas/external-speaker.schema'
import {
  createExternalSpeaker,
  DuplicateExternalSpeakerError,
  deleteExternalSpeaker,
  restoreExternalSpeaker,
  retireExternalSpeaker,
  updateExternalSpeaker,
} from '~/features/events/server/external-speakers.server'
import {
  createSpeakerCongregation,
  DuplicateSpeakerCongregationError,
  deleteSpeakerCongregation,
  updateSpeakerCongregation,
} from '~/features/events/server/speaker-congregations.server'
import * as m from '~/i18n/paraglide/messages'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// Every change on the external-speakers page, made through a fetcher: the list and the panel stay where they are, a
// toast says what happened, and a refusal comes back to the form that asked.

export type IntentOutcome =
  | { ok: true; message: string; extra?: Record<string, unknown>; removeFileKey?: string | null }
  | { ok: false; status: number; error: string; field?: string; existingId?: number }

interface Actor {
  id: number
  congregationId: number
}

async function duplicateMessage(
  db: TransactionClient,
  congregationId: number,
  name: string,
  speakerCongregationId: number | null,
) {
  if (speakerCongregationId == null) return m.external_speakers_error_duplicate_bare({ name })
  const target = await db.speakerCongregation.findFirst({
    where: { id: speakerCongregationId, congregationId },
    select: { name: true },
  })
  return m.external_speakers_error_duplicate({ name, congregation: target?.name ?? '' })
}

async function dispatch(db: TransactionClient, intent: ExternalSpeakerIntent, actor: Actor): Promise<IntentOutcome> {
  const { id: actorId, congregationId } = actor
  switch (intent.intent) {
    case 'speaker-create': {
      const { intent: _, ...input } = intent
      const created = await createExternalSpeaker(db, congregationId, actorId, input)
      return { ok: true, message: m.external_speakers_saved_new(), extra: { speakerId: created.id } }
    }
    case 'speaker-update': {
      const { intent: _, speakerId, ...input } = intent
      await updateExternalSpeaker(db, speakerId, congregationId, actorId, input)
      return { ok: true, message: m.external_speakers_saved() }
    }
    case 'speaker-retire':
      await retireExternalSpeaker(db, intent.speakerId, congregationId, actorId)
      return { ok: true, message: m.external_speakers_retired_toast() }
    case 'speaker-restore':
      await restoreExternalSpeaker(db, intent.speakerId, congregationId, actorId)
      return { ok: true, message: m.external_speakers_restored_toast() }
    case 'speaker-delete':
      await deleteExternalSpeaker(db, intent.speakerId, congregationId, actorId)
      return { ok: true, message: m.external_speakers_deleted_toast() }
    case 'congregation-create': {
      const { intent: _, next, ...input } = intent
      const created = await createSpeakerCongregation(db, congregationId, actorId, input)
      return {
        ok: true,
        message: m.external_speakers_congregation_created(),
        extra: { speakerCongregationId: created.id, ...(next ? { next } : {}) },
      }
    }
    case 'congregation-update': {
      const { intent: _, speakerCongregationId, ...input } = intent
      await updateSpeakerCongregation(db, speakerCongregationId, congregationId, actorId, input)
      return { ok: true, message: m.external_speakers_congregation_saved() }
    }
    case 'congregation-delete': {
      const { listFileKey } = await deleteSpeakerCongregation(db, intent.speakerCongregationId, congregationId, actorId)
      return { ok: true, message: m.external_speakers_congregation_deleted(), removeFileKey: listFileKey }
    }
  }
}

/** Runs one intent in the caller's transaction, turning a refused change into words for the form. */
export async function runExternalSpeakerIntent(
  db: TransactionClient,
  intent: ExternalSpeakerIntent,
  actor: Actor,
): Promise<IntentOutcome> {
  try {
    return await dispatch(db, intent, actor)
  } catch (error) {
    if (
      error instanceof DuplicateExternalSpeakerError &&
      (intent.intent === 'speaker-create' || intent.intent === 'speaker-update')
    ) {
      const message = await duplicateMessage(db, actor.congregationId, intent.name, intent.speakerCongregationId)
      return { ok: false, status: 409, error: message, field: 'name', existingId: error.existingId }
    }
    if (error instanceof DuplicateSpeakerCongregationError) {
      return {
        ok: false,
        status: 409,
        error: m.external_speakers_error_congregation_duplicate({ name: error.existingName }),
      }
    }
    if (error instanceof ConflictError) {
      const message =
        intent.intent === 'congregation-delete'
          ? m.external_speakers_error_congregation_not_empty()
          : intent.intent === 'speaker-delete'
            ? m.external_speakers_error_delete_on_list()
            : error.message
      return { ok: false, status: 409, error: message }
    }
    if (error instanceof NotFoundError) return { ok: false, status: 404, error: m.error_not_found() }
    throw error
  }
}

/** After a change made through a fetcher: `{ ok: true }` plus what the page needs next; the layout shows the toast. */
export async function okWithToast(request: Request, message: string, extra?: Record<string, unknown>) {
  const session = await getSession(request.headers.get('Cookie'))
  session.flash('success', message)
  return data({ ok: true as const, ...extra }, { headers: { 'Set-Cookie': await commitSession(session) } })
}
