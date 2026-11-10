import { parseWithZod } from '@conform-to/zod/v4'
import { data } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import {
  type AttributionPanelAction,
  attributionPanelActionSchema,
  attributionPanelQuerySchema,
} from '~/features/territories/schemas/attribution.schema'
import { getAssignPanel, getAttributionPanel } from '~/features/territories/server/attribution-panel.queries'
import { resume } from '~/features/territories/server/attribution-pause.aggregate'
import { getActiveCampaign } from '~/features/territories/server/campaign.queries'
import { createAttribution } from '~/features/territories/server/create-attribution.server'
import { deleteAttribution } from '~/features/territories/server/delete-attribution.server'
import { returnAttribution } from '~/features/territories/server/return-attribution.server'
import { updateAttribution } from '~/features/territories/server/update-attribution.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { AppError, ConflictError, NotFoundError, ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { formatLocalDate, parseLocalDate } from '~/shared/utils/date.server'

import type { Route } from './+types/panel'

// The attributions panel's data route: one attribution to change, or one territory to attribute, then the changes
// back — attribute, save, rentrer, cancel, resume. Both halves need the right to manage attributions.

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageTerritoryAttributions)
  const query = attributionPanelQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) return data({ ok: false as const, reason: 'invalid' as const }, { status: 400 })

  return withScopeFromContext(context, async (db, congregationId) => {
    const today = formatLocalDate(new Date())
    // With the phone territory kind on, phone work is a kind of territory, not a method of attribution.
    const phoneMethod = !(await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId))

    if ('attribution' in query.data) {
      const panel = await getAttributionPanel(db, congregationId, query.data.attribution, today)
      // Not an error status: after a cancel, the panel's loader is revalidated for the attribution just erased.
      if (panel == null) return { ok: false as const, reason: 'not-found' as const }
      return { ok: true as const, mode: 'edit' as const, today, phoneMethod, ...panel }
    }
    const panel = await getAssignPanel(db, congregationId, query.data.territory, today)
    if (panel == null) return { ok: false as const, reason: 'not-found' as const }
    return { ok: true as const, mode: 'assign' as const, today, phoneMethod, ...panel }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageTerritoryAttributions)
  const { id: actorId } = context.get(currentAccountContext)

  const submission = parseWithZod(await request.formData(), { schema: attributionPanelActionSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })
  const input = submission.value

  return withScopeFromContext(context, async (db, congregationId) => {
    const session = await getSession(request.headers.get('Cookie'))
    try {
      const message = await apply(db, input, { congregationId, actorId, today: formatLocalDate(new Date()) })
      session.flash('success', message)
      return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
    } catch (error) {
      const refused = refusal(error)
      if (refused == null) throw error
      return data(submission.reply(refused), { status: error instanceof NotFoundError ? 404 : 409 })
    }
  })
}

interface Actor {
  congregationId: number
  actorId: number
  today: string
}

/** Carries out what the panel asked and says so, in the words of the flash message. */
async function apply(db: TransactionClient, input: AttributionPanelAction, actor: Actor): Promise<string> {
  const { congregationId, actorId, today } = actor
  if (input.intent === 'create') {
    // During a campaign a territory goes out for it, door to door: the campaign decides when it comes back.
    const campaign = await getActiveCampaign(db, congregationId)
    await createAttribution(db, {
      territoryId: input.territory,
      publisherId: input.publisher,
      startDate: input['start-date'],
      notes: input.notes,
      type: campaign != null ? TerritoryAttributionKind.Default : input.type,
      campaignId: campaign?.id ?? null,
      congregationId,
      actorId,
    })
    return m.attributions_panel_created_flash()
  }

  const panel = await getAttributionPanel(db, congregationId, input.id, today)
  if (panel == null) throw new NotFoundError('Attribution', input.id)
  const number = panel.territory.number

  if (input.intent === 'update') {
    if (input['late-date'] < input['start-date']) throw new ValidationError('late-date', 'due_before_start')
    await updateAttribution(db, input.id, congregationId, actorId, {
      publisherId: input.publisher,
      notes: input.notes,
      // A campaign attribution keeps its method: the campaign set it.
      type: panel.attribution.campaign != null ? panel.attribution.type : input.type,
      startDate: parseLocalDate(input['start-date']),
      lateDate: parseLocalDate(input['late-date']),
    })
    return m.attributions_panel_saved_flash({ number })
  }
  if (input.intent === 'return') {
    await returnAttribution(db, { id: input.id, endDay: input['end-date'], today, congregationId, actorId })
    return m.attributions_panel_returned_flash({ number })
  }
  if (input.intent === 'resume') {
    await resume(db, input.id, congregationId, actorId)
    return m.attributions_panel_resumed_flash({ number })
  }
  await deleteAttribution(db, input.id, congregationId, actorId)
  return m.attributions_panel_cancelled_flash({ number })
}

const CONFLICTS: Record<string, () => string> = {
  attribution_overlap: () => m.attributions_overlap_error(),
  campaign_mode_active: () => m.attributions_campaign_mode_error(),
  campaign_not_active: () => m.attributions_campaign_not_active_error(),
  territory_occupied: () => m.attributions_territory_occupied_error(),
  attribution_already_returned: () => m.attributions_panel_already_returned(),
  attribution_not_paused: () => m.attributions_panel_not_paused(),
}

const FIELD_ERRORS: Record<string, () => string> = {
  return_before_start: () => m.attributions_panel_return_before_start(),
  return_in_future: () => m.attributions_panel_return_in_future(),
  due_before_start: () => m.attributions_panel_due_before_start(),
}

/** What the panel shows for a refusal the person can act on; null for anything else, which stays an error. */
function refusal(error: unknown): { formErrors?: string[]; fieldErrors?: Record<string, string[]> } | null {
  if (!(error instanceof AppError)) return null
  if (error instanceof ConflictError && error.message === 'publisher_role_not_allowed') {
    return { fieldErrors: { publisher: [m.attributions_publisher_role_error()] } }
  }
  if (error instanceof ConflictError) return { formErrors: [(CONFLICTS[error.message] ?? m.error_conflict)()] }
  if (error instanceof ValidationError && FIELD_ERRORS[error.message] != null) {
    return { fieldErrors: { [error.field]: [FIELD_ERRORS[error.message]()] } }
  }
  if (error instanceof NotFoundError) return { formErrors: [m.attributions_panel_unavailable()] }
  return null
}
