import { parseWithZod } from '@conform-to/zod/v4'
import { data, redirect } from 'react-router'
import { readerView } from '~/features/events/model/our-speaker'
import { ourListFilename } from '~/features/events/model/our-speaker-sheet'
import { ourSpeakerIntentSchema } from '~/features/events/schemas/our-speaker.schema'
import { countSpeakersOnLists } from '~/features/events/server/external-speakers.queries'
import { getOurSpeakerListPage } from '~/features/events/server/our-speakers.queries'
import { OurSpeakerListScreen } from '~/features/events/ui/OurSpeakerListScreen'
import * as m from '~/i18n/paraglide/messages'
import { isLocale } from '~/i18n/paraglide/runtime'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { isEmailConfigured } from '~/shared/infra/mailer.server'
import { Permission } from '~/shared/types/permission'
import { formatDateForInput } from '~/shared/utils/event-time'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { DEFAULT_LOCALE } from '~/shared/utils/language'
import { runWithLocale } from '~/shared/utils/locale-scope.server'
import { okWithToast } from './_external-speaker-action.server'
import { runOurListIntent } from './_our-list-action.server'
import type { Route } from './+types/ours'

// « Notre liste »: the brothers we send to the other congregations, who is at the head of the list, and where it went.

export const meta: Route.MetaFunction = () => [{ title: m.external_speakers_page_title() }]

function access(permissions: Set<string>) {
  const canManage = permissions.has(Permission.CanManageExternalSpeakers)
  return {
    canManage,
    canView: canManage || permissions.has(Permission.CanViewExternalSpeakers),
    canConfigure: permissions.has(Permission.CanConfigureCongregation),
    canViewPublishers: permissions.has(Permission.CanViewPublishers),
  }
}

export function loader({ context }: Route.LoaderArgs) {
  const rights = access(context.get(permissionsContext))
  const currentUser = context.get(currentAccountContext)
  if (!rights.canView) {
    logger.warn(`Tried to load our speaker list. User ID: ${currentUser.id}. Does NOT have rights.`)
    throw redirect('/')
  }
  const congregation = context.get(congregationContext)
  return withScopeFromContext(context, async (db, congregationId) => {
    const [page, receivedCount] = await Promise.all([
      getOurSpeakerListPage(db, congregationId),
      countSpeakersOnLists(db, congregationId),
    ])
    const today = formatDateForInput(new Date(), congregation.timezone)
    const locale = isLocale(congregation.locale) ? congregation.locale : DEFAULT_LOCALE
    return {
      // Someone who may see the list but not edit it gets what goes out, nothing more of anyone's record.
      page: rights.canManage ? page : readerView(page),
      candidateCount: page.brothers.length,
      receivedCount,
      // As the attachment is named: in the congregation's language, whoever sends it.
      pdfFilename: runWithLocale(locale, () => ourListFilename(congregation.displayName, today)),
      congregationName: congregation.displayName,
      emailFrom: congregation.emailFrom,
      emailEnabled: isEmailConfigured(),
      signature: formatPersonName(currentUser.member ?? currentUser),
      today,
      timezone: congregation.timezone,
      ...rights,
    }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const { canManage } = access(context.get(permissionsContext))
  if (!canManage) throw redirect('/programs/external-speakers/ours')

  const submission = parseWithZod(await request.formData(), { schema: ourSpeakerIntentSchema })
  if (submission.status !== 'success') {
    const issue = submission.error
      ? Object.entries(submission.error).find(([, messages]) => messages?.length)
      : undefined
    return data(
      { ok: false as const, error: issue?.[1]?.[0] ?? m.error_forbidden(), field: issue?.[0] },
      { status: 400 },
    )
  }
  const outcome = await runOurListIntent(submission.value, {
    actorId: context.get(currentAccountContext).id,
    congregation: context.get(congregationContext),
    withScope: fn => withScopeFromContext(context, fn),
  })
  if (!outcome.ok) return data({ ok: false as const, error: outcome.error }, { status: outcome.status })
  return okWithToast(request, outcome.message, outcome.extra)
}

export default function OurSpeakerListPage({ loaderData }: Route.ComponentProps) {
  return <OurSpeakerListScreen data={loaderData} />
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
