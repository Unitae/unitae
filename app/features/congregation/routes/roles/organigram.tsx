import { parseWithZod } from '@conform-to/zod'
import { Network, X } from 'lucide-react'
import { data, Link, redirect, useSearchParams } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { organigramIntentSchema } from '~/features/congregation/schemas/organigram.schema'
import { OrganigramNodePanel, type PanelNode } from '~/features/congregation/ui/OrganigramNodePanel'
import { OrganigramRootAdd } from '~/features/congregation/ui/OrganigramRootAdd'
import { OrganigramTree } from '~/features/congregation/ui/OrganigramTree'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { descendantIds, getOrganigram, type OrganigramNode } from '~/shared/domain/organigram.queries'
import {
  addRoleToOrganigram,
  moveOrganigramNode,
  removeRoleFromOrganigram,
  seatMember,
  setOrganigramParent,
  unseatMember,
} from '~/shared/domain/organigram.server'
import { canShowInOrganigram } from '~/shared/domain/role-tree.policy'
import { AppError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDisplayName } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/organigram'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Organigramme — Unitae' }]
}

interface FlatEntry {
  id: number
  label: string
  node: OrganigramNode
  parentId: number | null
  parentName: string | null
}

/**
 * Flatten to indented labels for the "move under" select.
 *
 * Non-breaking spaces, not ordinary ones: HTML collapses runs of whitespace inside <option>, so
 * plain indentation renders as a flat list however carefully it is built.
 */
function flatten(tree: OrganigramNode[], depth = 0, parent: OrganigramNode | null = null): FlatEntry[] {
  return tree.flatMap(node => [
    {
      id: node.id,
      label: `${'  '.repeat(depth)}${node.name}`,
      node,
      parentId: parent?.id ?? null,
      parentName: parent?.name ?? null,
    },
    ...flatten(node.children, depth + 1, node),
  ])
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
      }
    }

    const flat = flatten(tree)
    const selected = selectedId == null ? undefined : flat.find(entry => entry.id === selectedId)

    const [roles, members] = await Promise.all([
      db.role.findMany({
        where: { congregationId, showInOrganigram: false },
        select: { id: true, key: true, name: true },
        orderBy: [{ name: 'asc' }, { key: 'asc' }],
      }),
      db.member.findMany({
        where: { congregationId, leftAt: null, anonymizedAt: null },
        select: { id: true, firstname: true, lastname: true, account: { select: { id: true } } },
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
        .filter(role => canShowInOrganigram(role.key))
        .map(role => ({ id: role.id, name: getRoleDisplayName(role) })),
      moveTargets: flat.filter(entry => !forbidden.has(entry.id)).map(({ id, label }) => ({ id, label })),
      people: members.map(member => ({ id: member.id, firstname: member.firstname, lastname: member.lastname })),
      peopleWithoutAccount: members.filter(member => member.account == null).map(member => member.id),
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

  await withScopeFromContext(context, async db => {
    try {
      switch (value.intent) {
        case 'add':
          await addRoleToOrganigram(db, value.roleId, value.parentRoleId, congregationId, actorId)
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

  // Return with the same node still selected so the panel the user is working in stays open.
  // Adding puts the *new* node in focus; removing leaves nothing to return to.
  const stayOn = value.intent === 'remove' ? null : value.intent === 'add' ? value.roleId : value.roleId
  const target = stayOn == null ? '/congregation/roles/organigram' : `/congregation/roles/organigram?node=${stayOn}`
  return redirect(target, { headers: { 'Set-Cookie': await commitSession(session) } })
}

export default function OrganigramPage({ loaderData }: Route.ComponentProps) {
  const { tree, canManageRoles, selectedId, panel, people, peopleWithoutAccount, adoptable, moveTargets } = loaderData
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

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {tree.length === 0 ? (
            <EmptyState
              icon={Network}
              title="Aucun rôle dans l’organigramme"
              description="Ajoutez un rôle existant pour commencer à représenter l’organisation des services."
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

        {/*
          One panel, positioned by CSS rather than by two components.

          Below lg it is pinned to the bottom of the viewport like a sheet; at lg and above it
          becomes a sticky column beside the chart. Deliberately not a Radix Sheet: that renders
          an overlay at every width, which covered the desktop layout, and mounting both variants
          duplicated every heading in the DOM. Plain CSS also means no client state to lose across
          a form post, and the chart stays readable behind the panel on a phone.
        */}
        {panel && (
          <aside
            aria-label={`Rôle : ${panel.name}`}
            className={[
              // Docked above the bottom tab bar, not over it: the bar is fixed at z-40 with a
              // 56px body, and `FormActions` already establishes this offset for form pages.
              // 60vh rather than 80 so a few rows of the chart stay visible behind the panel —
              // otherwise you lose sight of the node you just selected.
              'fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20',
              'max-h-[60vh] overflow-y-auto border-t bg-background p-4 shadow-lg',
              // Switches at md, the same breakpoint where the tab bar disappears, so there is no
              // band where the panel is docked but there is nothing to dock above.
              'md:sticky md:inset-x-auto md:top-6 md:bottom-auto md:z-auto md:h-fit md:max-h-none',
              'md:w-[22rem] md:shrink-0 md:rounded-xl md:border md:shadow-none',
            ].join(' ')}
          >
            <div className="mx-auto flex max-w-2xl flex-col gap-4 md:max-w-none">
              <div className="flex justify-end md:hidden">
                <Button asChild variant="ghost" size="icon" aria-label="Fermer">
                  <Link to={{ search: closeParams.toString() }} preventScrollReset>
                    <X className="size-4" />
                  </Link>
                </Button>
              </div>
              <OrganigramNodePanel
                node={panel}
                people={people}
                peopleWithoutAccount={peopleWithoutAccount}
                adoptable={adoptable}
                moveTargets={moveTargets}
              />
            </div>
          </aside>
        )}
      </div>

      {/* Lets the last rows of the chart scroll clear of the docked panel on a phone. */}
      {panel && <div aria-hidden="true" className="h-[62vh] md:hidden" />}
    </div>
  )
}
