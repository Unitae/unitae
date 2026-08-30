import { parseWithZod } from '@conform-to/zod'
import { Network } from 'lucide-react'
import { data, Link, redirect, useSearchParams } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { organigramIntentSchema } from '~/features/congregation/schemas/organigram.schema'
import {
  buildMoveTargets,
  buildPanelNode,
  buildRolePickers,
} from '~/features/congregation/server/organigram-panel.server'
import { OrganigramHelp } from '~/features/congregation/ui/OrganigramHelp'
import { OrganigramPanelAside } from '~/features/congregation/ui/OrganigramPanelAside'
import { OrganigramRootAdd } from '~/features/congregation/ui/OrganigramRootAdd'
import { OrganigramTree } from '~/features/congregation/ui/OrganigramTree'

import { RolesTabs } from '~/features/congregation/ui/RolesTabs'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { SERVICE_COMMITTEE_KEY } from '~/shared/domain/built-in-roles.server'
import { getOrganigram } from '~/shared/domain/organigram.queries'
import {
  addRoleToOrganigram,
  createServiceInOrganigram,
  moveOrganigramNode,
  removeRoleFromOrganigram,
  setOrganigramParent,
} from '~/shared/domain/organigram.server'
import { flattenTree } from '~/shared/domain/organigram-layout'
import { seatMember, unseatMember } from '~/shared/domain/organigram-seats.server'
import { AppError, ConflictError, ValidationError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { cn } from '~/shared/utils/utils'

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
        rosters: [] as { id: number; name: string }[],
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

    return {
      tree,
      canManageRoles,
      selectedId: selected ? selected.id : null,
      panel: selected ? buildPanelNode(selected) : null,
      ...buildRolePickers(roles),
      moveTargets: buildMoveTargets(flat, selected),
      people: members.map(member => ({ id: member.id, firstname: member.firstname, lastname: member.lastname })),
      peopleWithoutAccount: members.filter(member => member.account == null).map(member => member.id),
      nonElderIds: members.filter(member => member.roleAssignments.length === 0).map(member => member.id),
      // The built-in committee exists but has never been placed: this congregation built its
      // chart before the committee was structured, and is offered the mapping instead.
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
        case 'attach':
          // One form, two outcomes: a typed name creates, a picked service attaches. The name
          // wins when both are filled — typing is the more deliberate gesture.
          if (value.name) {
            try {
              created = await createServiceInOrganigram(db, value.name, value.parentRoleId, congregationId, actorId, {
                isSinglePerson: value.singlePerson,
              })
            } catch (error) {
              // `createRole` reports the key collision in English, for developers. The admin
              // needs to know a service by that name already exists and that attaching it is
              // what they almost certainly meant.
              if (!(error instanceof ConflictError)) throw error
              throw new ConflictError(
                `Un service nommé « ${value.name} » existe déjà. Choisissez-le dans la liste pour le rattacher.`,
              )
            }
          } else if (value.roleId != null) {
            await addRoleToOrganigram(db, value.roleId, value.parentRoleId, congregationId, actorId)
          } else {
            throw new ValidationError('roleId', 'Choisissez un service existant ou saisissez un nom.')
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
  // nothing to return to; attaching focuses the service that was just made or adopted.
  let stayOn: number | null = null
  if (value.intent === 'attach') stayOn = created ?? value.roleId
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
    rosters,
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
            responsable de la prédication.
          </p>
          <Button asChild className="shrink-0">
            <Link to="/congregation/roles/organigram/adopt">Reprendre le comité</Link>
          </Button>
        </div>
      )}

      <div className="flex gap-6">
        {/* With a panel open on desktop, the chart column scrolls inside the viewport instead of
            growing the page: `sticky` never engages inside the app shell's overflow wrapper, so
            this is what keeps the panel beside the chart however long the chart is. Reading mode
            (no panel) keeps the natural full-page scroll. */}
        <div
          className={cn(
            'min-w-0 flex-1',
            panel && 'md:max-h-[calc(100vh-14rem)] md:overflow-y-auto md:overscroll-contain md:pr-1',
          )}
        >
          {tree.length === 0 ? (
            <EmptyState
              icon={Network}
              title="Aucun service dans l’organigramme"
              description="Remettez le collège des anciens au sommet, puis rattachez vos services en dessous."
              action={
                canManageRoles && rosters.length > 0 ? (
                  <OrganigramRootAdd rosters={rosters} emphasis="primary" />
                ) : undefined
              }
            />
          ) : (
            <div className="rounded-xl border p-4">
              <OrganigramTree tree={tree} selectedId={selectedId} />
            </div>
          )}

          {canManageRoles && tree.length > 0 && rosters.length > 0 && (
            <div className="pt-4">
              <OrganigramRootAdd rosters={rosters} />
            </div>
          )}

          {canManageRoles && (
            <div className="pt-4">
              <OrganigramHelp defaultOpen={tree.length === 0} />
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
