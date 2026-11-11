import { parseWithZod } from '@conform-to/zod/v4'
import { data, redirect } from 'react-router'
import { templateKey } from '~/features/settings/model/template-key'
import { createTemplateSchema } from '~/features/settings/schemas/template.schema'
import { createEventTemplate } from '~/features/settings/server/event-template.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { redirectWithToast } from '../_toast.server'
import type { Route } from './+types/new'

// A template is created from the list's dialog; the address of the old page leads there.
export function loader() {
  throw redirect('/settings/templates')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageProgramTemplates)
  const currentUser = context.get(currentAccountContext)
  const submission = parseWithZod(await request.formData(), { schema: createTemplateSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

  const { name, weekDay, startTime, endTime } = submission.value
  const template = await withScopeFromContext(context, async (db, congregationId) => {
    const taken = await db.eventTemplate.findMany({ where: { congregationId }, select: { key: true } })
    return createEventTemplate(db, {
      name,
      key: templateKey(
        name,
        taken.map(row => row.key),
      ),
      weekDay,
      startTime,
      endTime,
      congregationId,
      actorId: currentUser.id,
    })
  })

  return redirectWithToast(request, `/settings/templates/${template.id}`, m.settings_template_new_success({ name }))
}
