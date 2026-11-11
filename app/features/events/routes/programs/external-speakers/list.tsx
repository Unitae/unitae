import { parseWithZod } from '@conform-to/zod/v4'
import { data, redirect } from 'react-router'
import { externalSpeakerIntentSchema } from '~/features/events/schemas/external-speaker.schema'
import { getSpeakerVisits, listSpeakerDirectory } from '~/features/events/server/external-speakers.queries'
import { SpeakerDirectoryScreen } from '~/features/events/ui/SpeakerDirectoryScreen'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { deleteFileFromStorage } from '~/shared/infra/file-storage.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { okWithToast, runExternalSpeakerIntent } from './_external-speaker-action.server'
import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => [{ title: m.external_speakers_page_title() }]

function access(permissions: Set<string>) {
  const canManage = permissions.has(Permission.CanManageExternalSpeakers)
  return { canManage, canView: canManage || permissions.has(Permission.CanViewExternalSpeakers) }
}

export function loader({ request, context }: Route.LoaderArgs) {
  const { canManage, canView } = access(context.get(permissionsContext))
  const currentUser = context.get(currentAccountContext)
  if (!canView) {
    logger.warn(`Tried to load external speakers. User ID: ${currentUser.id}. Does NOT have rights.`)
    throw redirect('/')
  }
  const speakerId = Number(new URL(request.url).searchParams.get('speaker')) || null

  return withScopeFromContext(context, async (db, congregationId) => {
    const directory = await listSpeakerDirectory(db, congregationId)
    const open = speakerId != null && directory.speakers.some(speaker => speaker.id === speakerId)
    return {
      directory,
      visits: open && speakerId != null ? await getSpeakerVisits(db, congregationId, speakerId) : null,
      timezone: context.get(congregationContext).timezone,
      canManage,
    }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const { canManage } = access(context.get(permissionsContext))
  const currentUser = context.get(currentAccountContext)
  if (!canManage) throw redirect('/programs/external-speakers')

  const submission = parseWithZod(await request.formData(), { schema: externalSpeakerIntentSchema })
  if (submission.status !== 'success') {
    const issue = submission.error
      ? Object.entries(submission.error).find(([, messages]) => messages?.length)
      : undefined
    return data(
      { ok: false as const, error: issue?.[1]?.[0] ?? m.error_forbidden(), field: issue?.[0] },
      { status: 400 },
    )
  }

  const outcome = await withScopeFromContext(context, db =>
    runExternalSpeakerIntent(db, submission.value, { id: currentUser.id, congregationId: currentUser.congregationId }),
  )
  if (!outcome.ok) {
    const { status, ...refusal } = outcome
    return data(refusal, { status })
  }
  if (outcome.removeFileKey) {
    // After the commit: a failed removal leaves an orphan file, never a congregation pointing at nothing.
    await deleteFileFromStorage(outcome.removeFileKey).catch(error =>
      logger.warn('Could not remove a speaker list PDF', { error }),
    )
  }
  return okWithToast(request, outcome.message, outcome.extra)
}

export default function ExternalSpeakersPage({ loaderData }: Route.ComponentProps) {
  return <SpeakerDirectoryScreen page={loaderData} />
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
