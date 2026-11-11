import { parseWithZod } from '@conform-to/zod/v4'
import { data, redirect } from 'react-router'
import { type BuiltInFilterKey, toggleSchema } from '~/features/congregation/schemas/role.schema'
import { loadTeamsPage, TEAMS_VIEWS } from '~/features/congregation/server/teams-page.queries'
import type { TeamToggleResult } from '~/features/congregation/ui/TeamCell'
import { TeamsScreen } from '~/features/congregation/ui/TeamsScreen'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { holderOfMember } from '~/shared/domain/role-assignments.server'
import { GrantBeyondActorError } from '~/shared/domain/role-grant-limits.server'
import { addToRole, removeFromRole } from '~/shared/domain/role-membership.server'
import { ForbiddenError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDisplayName } from '~/shared/types/role'
import type { Route } from './+types/role-list'

export const meta: Route.MetaFunction = () => [{ title: m.teams_meta_title() }]

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanViewRoles) && !permissions.has(Permission.CanManageRoles)) throw redirect('/')
  const canManage = permissions.has(Permission.CanManageRoles)

  const params = new URL(request.url).searchParams
  // Everyone by default. `builtIn` is the parameter older links carry.
  const asked = params.get('view') ?? params.get('builtIn') ?? 'all'
  const view: BuiltInFilterKey = TEAMS_VIEWS.includes(asked as BuiltInFilterKey) ? (asked as BuiltInFilterKey) : 'all'
  const search = params.get('q')?.trim() ?? ''
  const collapsed = new Set((params.get('hide') ?? '').split(',').filter(Boolean))

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const page = await loadTeamsPage(db, congregationId, { search, view, collapsed })
    return { ...page, view, canManage }
  })
}

const refused = (error: string, status: number) => data<TeamToggleResult>({ ok: false, error }, { status })

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const { congregationId, id: actorId } = context.get(currentAccountContext)
  if (!permissions.has(Permission.CanManageRoles)) throw redirect('/')

  const submission = parseWithZod(await request.formData(), { schema: toggleSchema })
  if (submission.status !== 'success') return refused(m.teams_role_gone(), 400)
  const { memberId, roleId, intent } = submission.value

  try {
    return await withScopeFromContext(context, async db => {
      // A role belongs to the person: anyone in the congregation can be put in a team, login or not.
      const [member, role] = await Promise.all([
        db.member.findFirst({ where: { id: memberId, congregationId }, select: { firstname: true, lastname: true } }),
        db.role.findFirst({ where: { id: roleId, congregationId }, select: { key: true, name: true } }),
      ])
      const holder = member ? await holderOfMember(db, memberId, congregationId) : null
      if (!member || !holder || !role) return refused(m.teams_role_gone(), 404)

      if (intent === 'add') await addToRole(db, holder, roleId, congregationId, actorId, permissions)
      else await removeFromRole(db, holder, roleId, congregationId, actorId, permissions)
      // Named, because a tick deep in a grid gives no feedback of its own.
      const person = `${member.firstname ?? ''} ${member.lastname?.toLocaleUpperCase() ?? ''}`.trim()
      return data<TeamToggleResult>({ ok: true, intent, person, role: getRoleDisplayName(role) })
    })
  } catch (error) {
    // Refused after the transaction rolled back: rights the person lacks, or a role kept up to date from the records.
    if (error instanceof GrantBeyondActorError) return refused(m.error_forbidden(), 403)
    if (error instanceof ForbiddenError) return refused(m.teams_built_in_refused(), 403)
    throw error
  }
}

export default function TeamsRoute({ loaderData }: Route.ComponentProps) {
  return <TeamsScreen {...loaderData} />
}
