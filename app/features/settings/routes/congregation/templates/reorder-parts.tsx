import { redirect } from 'react-router'
import { isSystemTemplate } from '~/features/events'
import { isTemplateResponsible, reorderTemplateParts } from '~/features/events/index.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/reorder-parts'

export function loader({ params }: Route.LoaderArgs) {
  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')
  throw redirect(`/settings/congregation/templates/${templateId}`)
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  const { orderedIds } = (await request.json()) as { orderedIds: number[] }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false }
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, congregationId)
    if (!permissions.has(Permission.CanManageProgramTemplates) && !responsible) {
      throw redirect('/settings/congregation/templates')
    }

    // Mirror the guard on /edit — system templates have no parts today, but
    // if that ever changes we don't want a stale endpoint to be the loose
    // thread.
    const target = await db.eventTemplate.findFirst({
      where: { id: templateId, congregationId },
      select: { key: true },
    })
    if (target && isSystemTemplate(target.key)) {
      logger.warn(`Rejecting reorder-parts on system template. User ID: ${currentUser.id}. Template ID: ${templateId}.`)
      return { ok: false }
    }

    await reorderTemplateParts(db, congregationId, orderedIds)
    return { ok: true }
  })
}
