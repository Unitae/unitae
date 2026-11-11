import { redirect } from 'react-router'
import { loadOrganigramPage } from '~/features/congregation/server/organigram-page.queries'
import { OrganigramScreen } from '~/features/congregation/ui/OrganigramScreen'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { organigramRefusal, runOrganigramAction } from './_organigram-action.server'
import type { Route } from './+types/organigram'

export const meta: Route.MetaFunction = () => [{ title: m.org_meta_title() }]

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanViewRoles) && !permissions.has(Permission.CanManageRoles)) {
    throw redirect('/')
  }
  const canManage = permissions.has(Permission.CanManageRoles)
  // The selected role lives in the address, so a reload or a shared link opens its panel again. `node` is the
  // parameter older links carry.
  const params = new URL(request.url).searchParams
  const selectedId = Number(params.get('role') ?? params.get('node')) || null

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const page = await loadOrganigramPage(db, congregationId, { canManage, selectedId })
    return { ...page, canManage }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanManageRoles)) throw redirect('/congregation/roles/organigram')

  const formData = await request.formData()
  const { congregationId, id } = context.get(currentAccountContext)
  try {
    return await withScopeFromContext(context, db =>
      runOrganigramAction(request, db, formData, { id, congregationId, permissions }),
    )
  } catch (error) {
    // A refusal throws inside the transaction, which rolls back whatever the change had already written; only then
    // does it come back to the form as words.
    return organigramRefusal(error)
  }
}

export default function OrganigramRoute({ loaderData }: Route.ComponentProps) {
  return <OrganigramScreen page={loaderData} />
}
