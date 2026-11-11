import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { speakerListUpdateSchema } from '~/features/events/schemas/speaker-list-update.schema'
import { applySpeakerListUpdate } from '~/features/events/server/apply-speaker-list-update.server'
import { getSpeakerListContext } from '~/features/events/server/external-speakers.queries'
import {
  removeSpeakerListPdf,
  SpeakerListFileError,
  storeSpeakerListPdf,
} from '~/features/events/server/speaker-list-file.server'
import { SpeakerListUpdateScreen } from '~/features/events/ui/SpeakerListUpdateScreen'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/update-list'

const LIST = '/programs/external-speakers'

export const meta: Route.MetaFunction = ({ loaderData }) => [
  {
    title: loaderData
      ? m.external_speakers_update_meta({ name: loaderData.congregation.name })
      : m.external_speakers_page_title(),
  },
]

function requireManager(permissions: Set<string>) {
  if (!permissions.has(Permission.CanManageExternalSpeakers)) throw redirect(LIST)
}

export async function loader({ params, context }: Route.LoaderArgs) {
  requireManager(context.get(permissionsContext))
  const speakerCongregationId = requireParamId(params.speakerCongregationId, LIST)
  const page = await withScopeFromContext(context, (db, congregationId) =>
    getSpeakerListContext(db, congregationId, speakerCongregationId),
  )
  if (!page) throw redirect(LIST)
  return { ...page, timezone: context.get(congregationContext).timezone }
}

function refused(error: string, status = 400) {
  return data({ ok: false as const, error }, { status })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  requireManager(context.get(permissionsContext))
  const currentUser = context.get(currentAccountContext)
  const speakerCongregationId = requireParamId(params.speakerCongregationId, LIST)
  const form = await request.formData()

  let payload: unknown
  try {
    payload = JSON.parse(String(form.get('payload') ?? ''))
  } catch {
    return refused(m.error_forbidden())
  }
  const parsed = speakerListUpdateSchema.safeParse(payload)
  if (!parsed.success) return refused(parsed.error.issues[0]?.message ?? m.error_forbidden())

  const upload = form.get('file')
  let fileKey: string | null = null
  let savedName = ''
  if (upload instanceof File && upload.size > 0) {
    try {
      fileKey = await storeSpeakerListPdf(currentUser.congregationId, upload)
    } catch (error) {
      if (!(error instanceof SpeakerListFileError)) throw error
      return refused(
        error.reason === 'too_large'
          ? m.external_speakers_update_file_too_large()
          : m.external_speakers_update_file_invalid(),
      )
    }
  }

  try {
    const result = await withScopeFromContext(context, db =>
      applySpeakerListUpdate(db, currentUser.congregationId, currentUser.id, {
        speakerCongregationId,
        listDate: parsed.data.listDate,
        contacts: parsed.data.contacts,
        rows: parsed.data.rows,
        file: fileKey && upload instanceof File ? { key: fileKey, name: upload.name } : null,
      }),
    )
    savedName = result.congregationName
    // After the commit, so a failure never leaves the congregation pointing at a removed file.
    if (result.replacedFileKey) {
      await removeSpeakerListPdf(result.replacedFileKey).catch(error =>
        logger.warn('Could not remove a replaced speaker list PDF', { error }),
      )
    }
  } catch (error) {
    if (fileKey) await removeSpeakerListPdf(fileKey).catch(() => undefined)
    if (error instanceof NotFoundError) throw redirect(LIST)
    if (error instanceof ConflictError) return refused(m.external_speakers_update_stale(), 409)
    throw error
  }

  const session = await getSession(request.headers.get('Cookie'))
  session.flash('success', m.external_speakers_update_saved({ name: savedName }))
  return redirect(`${LIST}?congregation=${speakerCongregationId}`, {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}

export default function UpdateSpeakerListPage({ loaderData }: Route.ComponentProps) {
  return <SpeakerListUpdateScreen page={loaderData} />
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
