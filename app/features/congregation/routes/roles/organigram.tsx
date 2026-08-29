import { parseWithZod } from '@conform-to/zod'
import { Network } from 'lucide-react'
import { data, Link, redirect, useSearchParams } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { organigramIntentSchema } from '~/features/congregation/schemas/organigram.schema'
import type { PanelNode } from '~/features/congregation/ui/OrganigramNodePanel'
import { OrganigramPanelAside } from '~/features/congregation/ui/OrganigramPanelAside'
import { OrganigramRootAdd } from '~/features/congregation/ui/OrganigramRootAdd'
import { OrganigramTree } from '~/features/congregation/ui/OrganigramTree'

import { RolesTabs } from '~/features/congregation/ui/RolesTabs'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import {
  isAppointedRoleKey,
  isServiceCommitteePostKey,
  SERVICE_COMMITTEE_KEY,
} from '~/shared/domain/built-in-roles.server'
import { descendantIds, getOrganigram } from '~/shared/domain/organigram.queries'
import {
  addRoleToOrganigram,
  createServiceInOrganigram,
  moveOrganigramNode,
  removeRoleFromOrganigram,
  seatMember,
  setOrganigramParent,
  unseatMember,
} from '~/shared/domain/organigram.server'
import { flattenTree } from '~/shared/domain/organigram-layout'
import { canShowInOrganigram } from '~/shared/domain/role-tree.policy'
import { AppError, ConflictError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDisplayName } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/organigram'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Organigramme — Unitae' }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanViewRoles) && !permissions.has(Permission.CanManageRoles)) {
    throw redirect('/')
  }
  const canManageRoles = permissions.has(Permission.CanManageRoles)

  // The selected node lives in the URL rather than in component state: every mutation is a form
  // post that re-renders the page, and client state would not survive it — the panel would close
  // under the user on every single edit.
  const selectedId = Number(new URL(request.url).searchParams.get('node')) || null

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const tree = await getOrganigram(db, congregationId)

    if (!canManageRoles) {
      return {
        tree,
        canManageRoles,
        selectedId: null,
        panel: null,
        adoptable: [] as { id: number; name: string }[],
        moveTargets: [] as { id: number; label: string }[],
        people: [] as { id: number; firstname: string | null; lastname: string | null }[],
        peopleWithoutAccount: [] as number[],
        nonElderIds: [] as number[],
        committeePending: false,
      }
    }

    const flat = flattenTree(tree)
    const selected = selectedId == null ? undefined : flat.find(entry => entry.id === selectedId)

    const [roles, members] = await Promise.all([
      db.role.findMany({
        where: { congregationId, showInOrganigram: false },
        select: { id: true, key: true, name: true },
        orderBy: [{ name: 'asc' }, { key: 'asc' }],
      }),
      db.member.findMany({
        where: { congregationId, leftAt: null, anonymizedAt: null },
        select: {
          id: true,
          firstname: true,
          lastname: true,
          account: { select: { id: true } },
          // Only elders may hold a committee post, so the picker has to know who they are
          // rather than letting the admin choose and then be refused.
          roleAssignments: { where: { role: { key: 'elder' } }, select: { roleId: true } },
        },
        orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
      }),
    ])

    // A role may not become its own descendant's child, so those are not offered at all —
    // refusing the choice after a page reload teaches the same rule far less kindly.
    const links = flat.map(entry => ({ id: entry.id, parentRoleId: entry.parentId }))
    const forbidden = selected ? new Set([selected.id, ...descendantIds(links, selected.id)]) : new Set<number>()

    const panel: PanelNode | null = selected
      ? {
          id: selected.node.id,
          name: selected.node.name,
          isRoster: selected.node.isRoster,
          // The committee and its posts are placed by provisioning and never move, so the panel
          // must not offer to move or remove them.
          isFixed: isAppointedRoleKey(selected.node.key),
          isPost: isServiceCommitteePostKey(selected.node.key),
          parentId: selected.parentId,
          parentName: selected.parentName,
          childCount: selected.node.children.length,
          holders: selected.node.holders.map(holder => ({
            memberId: holder.memberId,
            name: `${holder.firstname ?? ''} ${holder.lastname?.toLocaleUpperCase() ?? ''}`.trim() || '—',
            kind: holder.kind,
          })),
        }
      : null

    return {
      tree,
      canManageRoles,
      selectedId: selected ? selected.id : null,
      panel,
      adoptable: roles
        // Appointed posts pass `canShowInOrganigram` but hold a fixed place, so the service
        // refuses to attach them anywhere — offering them here would be offering an error.
        .filter(role => canShowInOrganigram(role.key) && !isAppointedRoleKey(role.key))
        .map(role => ({ id: role.id, name: getRoleDisplayName(role) })),
      moveTargets: flat.filter(entry => !forbidden.has(entry.id)).map(({ id, label }) => ({ id, label })),
      people: members.map(member => ({ id: member.id, firstname: member.firstname, lastname: member.lastname })),
      peopleWithoutAccount: members.filter(member => member.account == null).map(member => member.id),
      nonElderIds: members.filter(member => member.roleAssignments.length === 0).map(member => member.id),
      // The built-in committee exists but has never been placed: this congregation built its
      // chart before the committee was structure, and is offered the mapping instead.
      committeePending: roles.some(role => role.key === SERVICE_COMMITTEE_KEY),
    }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanManageRoles)) throw redirect('/congregation/roles/organigram')

  const submission = parseWithZod(await request.formData(), { schema: organigramIntentSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

  const session = await getSession(request.headers.get('Cookie'))
  const { congregationId, id: actorId } = context.get(currentAccountContext)
  const value = submission.value
  // A newly created service is what the admin wants to look at next, so it becomes the selection.
  let created: number | null = null

  await withScopeFromContext(context, async db => {
    try {
      switch (value.intent) {
        case 'add':
          await addRoleToOrganigram(db, value.roleId, value.parentRoleId, congregationId, actorId)
          break
        case 'create':
          try {
            created = await createServiceInOrganigram(db, value.name, value.parentRoleId, congregationId, actorId)
          } catch (error) {
            // `createRole` reports the key collision in English, for developers. The admin needs
            // to know a service by that name already exists and that attaching it is what they
            // almost certainly meant.
            if (!(error instanceof ConflictError)) throw error
            throw new ConflictError(
              `Un service nommé « ${value.name} » existe déjà. Choisissez-le dans la liste pour le rattacher.`,
            )
          }
          break
        case 'remove':
          await removeRoleFromOrganigram(db, value.roleId, congregationId, actorId)
          break
        case 'set-parent':
          await setOrganigramParent(db, value.roleId, value.parentRoleId, congregationId, actorId)
          break
        case 'move':
          await moveOrganigramNode(db, value.roleId, value.direction, congregationId, actorId)
          break
        case 'seat':
          await seatMember(
            db,
            { roleId: value.roleId, memberId: value.memberId, kind: value.kind },
            congregationId,
            actorId,
          )
          break
        case 'unseat':
          await unseatMember(db, value.roleId, value.memberId, congregationId, actorId)
          break
      }
    } catch (error) {
      // Every refusal here is a rule the admin can act on — a cycle, a depth cap, a member with
      // no login. Surfacing the message beats a 500 that says nothing.
      if (!(error instanceof AppError)) throw error
      session.flash('error', error.message)
    }
  })

  // Return with a node selected so the panel the admin is working in stays open. Removing leaves
  // nothing to return to; creating focuses the service that was just made.
  let stayOn: number | null = null
  if (value.intent === 'create') stayOn = created
  else if (value.intent !== 'remove') stayOn = value.roleId
  const target = stayOn == null ? '/congregation/roles/organigram' : `/congregation/roles/organigram?node=${stayOn}`
  return redirect(target, { headers: { 'Set-Cookie': await commitSession(session) } })
}

export default function OrganigramPage({ loaderData }: Route.ComponentProps) {
  const {
    tree,
    canManageRoles,
    selectedId,
    panel,
    people,
    peopleWithoutAccount,
    nonElderIds,
    adoptable,
    moveTargets,
    committeePending,
  } = loaderData
  const [searchParams] = useSearchParams()

  const closeParams = new URLSearchParams(searchParams)
  closeParams.delete('node')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organigramme"
        subtitle="L’organisation des services de la congrégation"
        breadcrumbs={[{ label: m.sidebar_assembly() }, { label: 'Organigramme' }]}
      />

      <RolesTabs />

      {canManageRoles && committeePending && (
        // Shown until the committee is adopted. Deliberately not a silent auto-migration: the
        // mapping moves people and permissions, and a wrong guess must be visible first.
        <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Votre organigramme n’utilise pas encore le comité de service standard — coordinateur, secrétaire et
            surveillant du service.
          </p>
          <Button asChild className="shrink-0">
            <Link to="/congregation/roles/organigram/adopt">Reprendre le comité</Link>
          </Button>
        </div>
      )}

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {tree.length === 0 ? (
            <EmptyState
              icon={Network}
              title="Aucun service dans l’organigramme"
              description="Ajoutez un service pour commencer à représenter l’organisation de la congrégation."
              action={canManageRoles ? <OrganigramRootAdd adoptable={adoptable} emphasis="primary" /> : undefined}
            />
          ) : (
            <div className="rounded-xl border p-4">
              <OrganigramTree tree={tree} selectedId={selectedId} />
            </div>
          )}

          {canManageRoles && tree.length > 0 && (
            <div className="pt-4">
              <OrganigramRootAdd adoptable={adoptable} />
            </div>
          )}
        </div>

        {panel && (
          <OrganigramPanelAside
            panel={panel}
            people={people}
            peopleWithoutAccount={peopleWithoutAccount}
            nonElderIds={nonElderIds}
            adoptable={adoptable}
            moveTargets={moveTargets}
            closeSearch={closeParams.toString()}
          />
        )}
      </div>

      {/* Lets the last rows of the chart scroll clear of the docked panel on a phone. */}
      {panel && <div aria-hidden="true" className="h-[62vh] md:hidden" />}
    </div>
  )
}
