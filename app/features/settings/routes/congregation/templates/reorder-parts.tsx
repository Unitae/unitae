import { redirect } from 'react-router'
import { isTemplateResponsible, reorderTemplateParts } from '~/features/events/server/programme-templates.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/reorder-parts'

export function loader({ params }: Route.LoaderArgs) {
  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')
  throw redirect(`/settings/congregation/templates/${templateId}`)
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  const { orderedIds } = (await request.json()) as { orderedIds: number[] }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false }
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, congregationId)
    if (!permissions.has(Role.ProgramManager) && !responsible) {
      throw redirect('/settings/congregation/templates')
    }

    await reorderTemplateParts(db, congregationId, orderedIds)
    return { ok: true }
  })
}
