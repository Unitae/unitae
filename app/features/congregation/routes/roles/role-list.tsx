import { parseWithZod } from '@conform-to/zod'
import { Plus } from 'lucide-react'
import { data, Form, Link, redirect, useSubmit } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { type BuiltInFilterKey, toggleSchema } from '~/features/congregation/schemas/role.schema'
import { buildMatrixGroups } from '~/features/congregation/server/role-matrix.server'
import { RoleMatrixCards } from '~/features/congregation/ui/RoleMatrixCards'
import { RoleMatrixTable } from '~/features/congregation/ui/RoleMatrixTable'
import { RolesTabs } from '~/features/congregation/ui/RolesTabs'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { addUserToRole, removeUserFromRole } from '~/shared/domain/roles.server'
import { ForbiddenError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDisplayName } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import type { Route } from './+types/role-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.congregation_roles_meta_title() }]
}

const FILTER_LABELS: Record<BuiltInFilterKey, () => string> = {
  all: () => m.congregation_roles_filter_all(),
  male: () => m.congregation_roles_filter_male(),
  female: () => m.congregation_roles_filter_female(),
  publisher: () => m.congregation_roles_filter_publisher(),
  baptized: () => m.congregation_roles_filter_baptized(),
  anointed: () => m.congregation_roles_filter_anointed(),
  elder: () => m.congregation_roles_filter_elder(),
  'assistant-servant': () => m.congregation_roles_filter_assistant_servant(),
}

// Built-in domain roles only apply to active publishers. The `all` filter still
// shows everyone (admins and other non-publisher accounts), but every targeted
// built-in filter ANDs `isPublisher: true` so the matrix matches what the role
// sync helper actually assigns.
function buildBuiltInWhere(filter: BuiltInFilterKey) {
  switch (filter) {
    case 'male':
      return { isPublisher: true, isMale: true }
    case 'female':
      return { isPublisher: true, isMale: false }
    case 'publisher':
      return { isPublisher: true }
    case 'baptized':
      return { isPublisher: true, baptismDate: { not: null } }
    case 'anointed':
      return { isPublisher: true, isAnointed: true }
    case 'elder':
      return { isPublisher: true, isHelder: true }
    case 'assistant-servant':
      return { isPublisher: true, isServant: true }
    default:
      return {}
  }
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canViewRoles = permissions.has(Permission.CanViewRoles) || permissions.has(Permission.CanManageRoles)
  const canManageRoles = permissions.has(Permission.CanManageRoles)

  if (!canViewRoles) throw redirect('/')

  const url = new URL(request.url)
  const search = url.searchParams.get('q')?.trim() || undefined
  const filterParam = url.searchParams.get('builtIn') ?? 'male'
  const filter: BuiltInFilterKey = (Object.keys(FILTER_LABELS) as BuiltInFilterKey[]).includes(
    filterParam as BuiltInFilterKey,
  )
    ? (filterParam as BuiltInFilterKey)
    : 'male'
  const collapsed = new Set((url.searchParams.get('hide') ?? '').split(',').filter(Boolean))

  return withScopeFromContext(context, async db => {
    // Built-ins come along for structure — the bands are the committee posts' branches of the
    // organigram — but only custom roles become columns.
    const roles = await db.role.findMany({
      where: { congregationId: currentUser.congregationId },
      select: {
        id: true,
        key: true,
        name: true,
        isBuiltIn: true,
        isSinglePerson: true,
        showInOrganigram: true,
        parentRoleId: true,
        organigramOrder: true,
      },
    })
    // Holder counts are congregation-wide, not filtered: « Sono : 4 » should stay true while
    // the rows show only the sisters. Split by seat kind, the same rows also say which roles
    // still hold plain members — the legacy columns that must stay visible until emptied.
    const assignmentCounts = await db.userRoleAssignment.groupBy({
      by: ['roleId', 'kind'],
      where: { congregationId: currentUser.congregationId, role: { isBuiltIn: false } },
      _count: { roleId: true },
    })
    const counts: Record<number, number> = {}
    for (const row of assignmentCounts) {
      counts[row.roleId] = (counts[row.roleId] ?? 0) + row._count.roleId
    }
    const rolesWithPlainMembers = new Set(assignmentCounts.filter(row => row.kind === 'member').map(row => row.roleId))

    const groups = buildMatrixGroups(roles, collapsed, rolesWithPlainMembers)

    const members = await db.member.findMany({
      where: {
        congregationId: currentUser.congregationId,
        anonymizedAt: null,
        leftAt: null,
        ...(search
          ? {
              OR: [
                { firstname: { contains: search, mode: 'insensitive' as const } },
                { lastname: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...buildBuiltInWhere(filter),
      },
      include: {
        // Custom (management) roles live on UserAccount.roleAssignments.
        // Members without an account contribute no assignments here.
        account: {
          include: {
            roleAssignments: {
              where: { role: { isBuiltIn: false } },
              select: { roleId: true, kind: true },
            },
          },
        },
      },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    })

    return {
      groups,
      counts,
      members: members.map(member => ({
        id: member.id,
        firstname: member.firstname,
        lastname: member.lastname,
        // The seat kind rides along so the grid can say R/A, not just "in it".
        seats: Object.fromEntries((member.account?.roleAssignments ?? []).map(a => [a.roleId, a.kind])),
        // Eligibility is granted to the account, so a member without a login cannot hold one.
        // Show them greyed out with the reason rather than letting the toggle fail.
        hasAccount: member.account != null,
      })),
      canManageRoles,
      currentSearch: search ?? '',
      currentFilter: filter,
    }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.CanManageRoles)) throw redirect('/')

  const submission = parseWithZod(await request.formData(), { schema: toggleSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { memberId, roleId, intent } = submission.value
  const session = await getSession(request.headers.get('Cookie'))

  await withScopeFromContext(context, async db => {
    // Eligibility groups are granted to the account, but the matrix is a grid of people. Resolve
    // the account here rather than asking the form to know it.
    const member = await db.member.findFirst({
      where: { id: memberId, congregationId: currentUser.congregationId },
      select: { firstname: true, lastname: true, account: { select: { id: true } } },
    })
    if (!member?.account) {
      session.flash('error', m.congregation_roles_no_account_error())
      return
    }
    const userId = member.account.id

    try {
      if (intent === 'add') {
        await addUserToRole(db, userId, roleId, currentUser.congregationId, currentUser.id)
      } else {
        await removeUserFromRole(db, userId, roleId, currentUser.congregationId, currentUser.id)
      }
      // Name the change: a toggle deep in a grid gives no feedback of its own, and « Marc DUPONT
      // fait partie de Sono » is what tells a cautious admin their click did the right thing.
      const role = await db.role.findFirst({
        where: { id: roleId, congregationId: currentUser.congregationId },
        select: { key: true, name: true },
      })
      if (role) {
        const person = `${member.firstname ?? ''} ${member.lastname?.toLocaleUpperCase() ?? ''}`.trim()
        const flash = intent === 'add' ? m.congregation_roles_added_flash : m.congregation_roles_removed_flash
        session.flash('success', flash({ person, role: getRoleDisplayName(role) }))
      }
    } catch (error) {
      if (error instanceof ForbiddenError) {
        session.flash('error', m.congregation_roles_built_in_assignment_error())
      } else {
        throw error
      }
    }
  })

  const url = new URL(request.url)
  const back = `/congregation/roles${url.search}`
  return redirect(back, { headers: { 'Set-Cookie': await commitSession(session) } })
}

export default function RoleMatrixPage({ loaderData }: Route.ComponentProps) {
  const { groups, counts, members, canManageRoles, currentSearch, currentFilter } = loaderData
  const submit = useSubmit()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.congregation_roles_title()}
        subtitle={m.congregation_roles_subtitle()}
        breadcrumbs={[{ label: m.sidebar_assembly() }, { label: m.sidebar_assembly_roles() }]}
        actions={
          canManageRoles ? (
            <Button asChild>
              <Link to="./new">
                <Plus className="mr-1 size-4" />
                {m.congregation_roles_new_button()}
              </Link>
            </Button>
          ) : null
        }
      />

      <RolesTabs />

      <Form
        method="get"
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onChange={event => submit(event.currentTarget)}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor="q" className="text-muted-foreground text-xs">
            {m.congregation_roles_search_placeholder()}
          </Label>
          <Input id="q" name="q" defaultValue={currentSearch} placeholder={m.congregation_roles_search_placeholder()} />
        </div>
        <div className="space-y-1 sm:w-64">
          <Label htmlFor="builtIn" className="text-muted-foreground text-xs">
            {m.congregation_roles_filter_label()}
          </Label>
          <Select name="builtIn" defaultValue={currentFilter}>
            <SelectTrigger id="builtIn">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FILTER_LABELS) as BuiltInFilterKey[]).map(key => (
                <SelectItem key={key} value={key}>
                  {FILTER_LABELS[key]()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Form>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
          {m.congregation_roles_empty_roles()}
        </div>
      ) : (
        <>
          <div className="max-md:hidden">
            <RoleMatrixTable groups={groups} members={members} counts={counts} canManageRoles={canManageRoles} />
          </div>
          <div className="md:hidden">
            <RoleMatrixCards groups={groups} members={members} canManageRoles={canManageRoles} />
          </div>
        </>
      )}
    </div>
  )
}
