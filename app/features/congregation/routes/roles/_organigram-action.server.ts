import { parseWithZod } from '@conform-to/zod/v4'
import { data } from 'react-router'
import { type OrganigramIntent, organigramIntentSchema } from '~/features/congregation/schemas/organigram.schema'
import * as m from '~/i18n/paraglide/messages'
import {
  addRoleToOrganigram,
  createServiceInOrganigram,
  moveOrganigramNode,
  removeRoleFromOrganigram,
  setOrganigramParent,
  setRoleSinglePerson,
} from '~/shared/domain/organigram.server'
import { adoptServiceCommittee } from '~/shared/domain/organigram-adoption.server'
import { seatMember, unseatMember } from '~/shared/domain/organigram-seats.server'
import { type ActorPermissions, GrantBeyondActorError } from '~/shared/domain/role-grant-limits.server'
import { RoleReservesError, type SoleReservations } from '~/shared/domain/role-reservations.server'
import { createRole, deleteRole, updateRoleIdentity } from '~/shared/domain/roles.server'
import { AppError, ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getRoleDisplayName } from '~/shared/types/role'
import { okWithToast } from './_toast.server'

// Every change on the organigram page, made through a fetcher: the tree and the panel stay where they are, a toast
// says what happened, and a refusal comes back to the form that asked.

export interface OrganigramActor {
  id: number
  congregationId: number
  permissions: ActorPermissions
}

/** Why a change was refused: a sentence, and for a deletion each place the role still alone reserves. */
export type OrganigramRefusal = { ok: false; error: string; reserves?: string[] }

const refused = (error: string, status = 400, reserves?: string[]) =>
  data<OrganigramRefusal>({ ok: false, error, ...(reserves ? { reserves } : {}) }, { status })

const BUILT_IN_KIND_LABELS: Record<string, () => string> = {
  classical: m.territory_kind_label_classical,
  univ: m.territory_kind_label_univ,
  commerces: m.territory_kind_label_commerces,
  phone: m.territory_kind_label_phone,
  hotel: m.territory_kind_label_hotel,
}

/** Each place a role alone reserves, in words: what the person must give to another role before deleting it. */
export function reservationLines(found: SoleReservations): string[] {
  const { programmeSlots } = found
  return [
    ...found.sections.map(name => m.org_reserves_section({ name })),
    ...found.territoryKinds.map(kind =>
      m.org_reserves_kind({ name: kind.name ?? BUILT_IN_KIND_LABELS[kind.key]?.() ?? kind.key }),
    ),
    ...found.templateSlots.map(slot => m.org_reserves_slot({ name: slot.name, template: slot.template })),
    ...(programmeSlots === 0
      ? []
      : [
          programmeSlots === 1
            ? m.org_reserves_programmes_one()
            : m.org_reserves_programmes_many({ count: String(programmeSlots) }),
        ]),
  ]
}

async function roleName(db: TransactionClient, roleId: number | null, congregationId: number): Promise<string> {
  if (roleId == null) return ''
  const role = await db.role.findFirst({ where: { id: roleId, congregationId }, select: { key: true, name: true } })
  return role ? getRoleDisplayName(role) : ''
}

async function personName(db: TransactionClient, memberId: number, congregationId: number): Promise<string> {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { firstname: true, lastname: true },
  })
  return member ? `${member.firstname ?? ''} ${member.lastname?.toLocaleUpperCase() ?? ''}`.trim() : ''
}

function seatWord(kind: string, isSingle: boolean): string {
  if (kind === 'deputy') return m.org_seat_deputy()
  if (kind === 'member') return m.org_seat_member()
  return isSingle ? m.org_seat_leader_personal() : m.org_seat_leader_team()
}

/** The committee takeover: a post key and the role it takes over (empty = start empty), in pairs. */
async function adopt(request: Request, db: TransactionClient, formData: FormData, actor: OrganigramActor) {
  const postKeys = formData.getAll('postKey').map(String)
  const fromRoleIds = formData.getAll('fromRoleId').map(String)
  if (postKeys.length === 0 || postKeys.length !== fromRoleIds.length) return refused(m.error_forbidden())
  const choices = postKeys.map((postKey, index) => ({ postKey, fromRoleId: Number(fromRoleIds[index]) || null }))
  await adoptServiceCommittee(db, choices, actor.congregationId, actor.id, actor.permissions)
  return okWithToast(request, m.org_saved_adopted())
}

type CreateIntent = Extract<OrganigramIntent, { intent: 'create' }>

/** A new role: under a role of the chart, or outside it. Its panel opens next, to name its people. */
async function create(request: Request, db: TransactionClient, value: CreateIntent, actor: OrganigramActor) {
  const { congregationId, id: actorId } = actor
  let roleId: number
  try {
    roleId =
      value.parentRoleId == null
        ? (
            await createRole(db, congregationId, actorId, {
              name: value.name,
              description: value.description || null,
              permissionKeys: [],
              isSinglePerson: value.singlePerson,
            })
          ).id
        : await createServiceInOrganigram(db, value.name, value.parentRoleId, congregationId, actorId, {
            isSinglePerson: value.singlePerson,
            description: value.description,
          })
  } catch (error) {
    // `createRole` reports the key collision for developers; the person needs to know the role already exists.
    if (error instanceof ConflictError) return refused(m.org_error_exists({ name: value.name }), 409)
    throw error
  }
  return okWithToast(request, m.org_saved_created({ role: value.name }), { roleId })
}

async function run(request: Request, db: TransactionClient, formData: FormData, actor: OrganigramActor) {
  if (formData.get('intent') === 'adopt') return adopt(request, db, formData, actor)
  const submission = parseWithZod(formData, { schema: organigramIntentSchema })
  if (submission.status !== 'success') return refused(m.org_error_name())
  const value = submission.value
  const { congregationId, id: actorId, permissions } = actor

  switch (value.intent) {
    case 'seat': {
      await seatMember(db, value, congregationId, actorId, permissions)
      const role = await db.role.findFirst({
        where: { id: value.roleId, congregationId },
        select: { isSinglePerson: true },
      })
      const seat = seatWord(value.kind, role?.isSinglePerson ?? false)
      const person = await personName(db, value.memberId, congregationId)
      return okWithToast(
        request,
        m.org_saved_seat({ person, seat, role: await roleName(db, value.roleId, congregationId) }),
      )
    }
    case 'unseat': {
      await unseatMember(db, value.roleId, value.memberId, congregationId, actorId, permissions)
      const person = await personName(db, value.memberId, congregationId)
      return okWithToast(
        request,
        m.org_saved_unseat({ person, role: await roleName(db, value.roleId, congregationId) }),
      )
    }
    case 'move':
      await moveOrganigramNode(db, value.roleId, value.direction, congregationId, actorId)
      return okWithToast(request, m.org_saved_moved())
    case 'set-parent':
      await setOrganigramParent(db, value.roleId, value.parentRoleId, congregationId, actorId)
      return okWithToast(request, m.org_saved_moved())
    case 'remove':
      await removeRoleFromOrganigram(db, value.roleId, congregationId, actorId)
      return okWithToast(request, m.org_saved_removed({ role: await roleName(db, value.roleId, congregationId) }))
    case 'add': {
      // An existing role attached under another, or a list put back at the top.
      await addRoleToOrganigram(db, value.roleId, value.parentRoleId, congregationId, actorId)
      const role = await roleName(db, value.roleId, congregationId)
      const message =
        value.parentRoleId == null
          ? m.org_saved_root({ role })
          : m.org_saved_attached({ role, parent: await roleName(db, value.parentRoleId, congregationId) })
      return okWithToast(request, message, { roleId: value.roleId })
    }
    case 'create':
      return create(request, db, value, actor)
    case 'update':
      await updateRoleIdentity(db, value.roleId, congregationId, actorId, {
        name: value.name,
        description: value.description || null,
        organigramNote: value.note || null,
      })
      await setRoleSinglePerson(db, value.roleId, value.singlePerson, congregationId, actorId)
      return okWithToast(request, m.org_saved_updated())
    case 'delete': {
      const role = await roleName(db, value.roleId, congregationId)
      await deleteRole(db, value.roleId, congregationId, actorId, permissions)
      return okWithToast(request, m.org_saved_deleted({ role }))
    }
  }
}

/** Runs one change asked of the organigram page, inside the route's transaction; a refusal throws and rolls it back. */
export function runOrganigramAction(
  request: Request,
  db: TransactionClient,
  formData: FormData,
  actor: OrganigramActor,
) {
  return run(request, db, formData, actor)
}

/**
 * Words for a refused change, once its transaction has rolled back. Every refusal is a rule the person can act on — a
 * cycle, a non-elder on a post, rights they do not hold, places a role alone reserves — so it comes back to the form,
 * never as an error page. Anything else is rethrown.
 */
export function organigramRefusal(error: unknown) {
  if (error instanceof RoleReservesError) {
    return refused(m.org_reserves_body(), 409, reservationLines(error.reservations))
  }
  if (error instanceof GrantBeyondActorError) return refused(m.error_forbidden(), 403)
  if (error instanceof AppError) return refused(error.message, error.statusCode)
  throw error
}
