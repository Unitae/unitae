import { parseWithZod } from '@conform-to/zod'
import { Pencil, Plus, Shield } from 'lucide-react'
import { data, Form, Link, redirect, useSubmit } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { type BuiltInFilterKey, toggleSchema } from '~/features/congregation/schemas/role.schema'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
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

  return withScopeFromContext(context, async db => {
    const customRoles = await db.role.findMany({
      where: { congregationId: currentUser.congregationId, isBuiltIn: false },
      orderBy: [{ name: 'asc' }, { key: 'asc' }],
      select: { id: true, key: true, name: true },
    })

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
              select: { roleId: true },
            },
          },
        },
      },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    })

    return {
      customRoles,
      members: members.map(member => ({
        id: member.id,
        firstname: member.firstname,
        lastname: member.lastname,
        assignedRoleIds: member.account?.roleAssignments.map(a => a.roleId) ?? [],
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

  const { userId, roleId, intent } = submission.value
  const session = await getSession(request.headers.get('Cookie'))

  await withScopeFromContext(context, async db => {
    try {
      if (intent === 'add') {
        await addUserToRole(db, userId, roleId, currentUser.congregationId, currentUser.id)
      } else {
        await removeUserFromRole(db, userId, roleId, currentUser.congregationId, currentUser.id)
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

interface Member {
  id: number
  firstname: string | null
  lastname: string | null
  assignedRoleIds: number[]
}

function MatrixRow({
  member,
  customRoles,
  canManageRoles,
}: {
  member: Member
  customRoles: Array<{ id: number; key: string; name: string | null }>
  canManageRoles: boolean
}) {
  const assigned = new Set(member.assignedRoleIds)
  return (
    <TableRow>
      <TableCell className="sticky left-0 whitespace-nowrap bg-background font-medium">
        {member.firstname} {member.lastname?.toLocaleUpperCase()}
      </TableCell>
      {customRoles.map(role => {
        const isAssigned = assigned.has(role.id)
        return (
          <TableCell key={role.id} className="text-center">
            <Form method="post">
              <input type="hidden" name="userId" value={member.id} />
              <input type="hidden" name="roleId" value={role.id} />
              <input type="hidden" name="intent" value={isAssigned ? 'remove' : 'add'} />
              <button
                type="submit"
                disabled={!canManageRoles}
                aria-label={isAssigned ? 'Remove' : 'Add'}
                className={`inline-flex size-5 items-center justify-center rounded-md border transition ${
                  isAssigned
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:bg-accent'
                } ${!canManageRoles ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                {isAssigned ? <span className="text-xs">✓</span> : null}
              </button>
            </Form>
          </TableCell>
        )
      })}
    </TableRow>
  )
}

export default function RoleMatrixPage({ loaderData }: Route.ComponentProps) {
  const { customRoles, members, canManageRoles, currentSearch, currentFilter } = loaderData
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

      {customRoles.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
          {m.congregation_roles_empty_roles()}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background">{m.congregation_roles_table_member()}</TableHead>
                {customRoles.map(role => (
                  <TableHead key={role.id} className="whitespace-nowrap text-center">
                    {canManageRoles ? (
                      <Link to={`./${role.id}/edit`} className="inline-flex items-center gap-1 hover:text-primary">
                        <Shield className="size-3.5" />
                        <span>{getRoleDisplayName(role)}</span>
                        <Pencil className="size-3 text-muted-foreground" />
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Shield className="size-3.5" />
                        <span>{getRoleDisplayName(role)}</span>
                      </span>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={customRoles.length + 1} className="text-center text-muted-foreground text-sm">
                    {m.congregation_roles_empty_members()}
                  </TableCell>
                </TableRow>
              ) : (
                members.map(member => (
                  <MatrixRow
                    key={member.id}
                    member={member}
                    customRoles={customRoles}
                    canManageRoles={canManageRoles}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
