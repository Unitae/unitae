import * as m from '~/i18n/paraglide/messages'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import { LimitService } from '~/shared/domain/limits.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import { arrivalOnReturn } from '../model/arrival'
import { purgeEmergencyContacts } from './emergency-info.aggregate'
import {
  type CreateDirectParams,
  haveIdentityFlagsChanged,
  type MemberFormFields,
  memberDataFromForm,
} from './member-identity'
import {
  _ensureMemberIsNotGroupResponsible,
  _loadGroupMembership,
  _loadMemberIdentity,
} from './member-preconditions.server'

export type { CreateDirectParams }

export type CreateMemberParams = MemberFormFields & {
  congregationId: number
  actorId: number
}

// `email` is the Member's contact email, NOT a login — a login is provisioned
// separately via `linkAccountToMember`.
export async function createMember(db: TransactionClient, congregation: CongregationInfo, params: CreateMemberParams) {
  const limits = new LimitService(db, congregation)
  await limits.errorIfWouldGoOverLimit('members')

  const member = await db.member.create({
    data: { ...memberDataFromForm(params), isPublisher: true, congregationId: params.congregationId },
  })

  await syncBuiltInRoleAssignments(db, member.id, params.congregationId, params.actorId)

  audit({
    action: AuditAction.PublisherCreated,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: 'Member',
    entityId: member.id,
  })

  return member
}

export async function createDirect(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  params: CreateDirectParams,
) {
  const member = await db.member.create({
    data: {
      ...params,
      firstnameNormalized: stripDiacritics(params.firstname),
      lastnameNormalized: stripDiacritics(params.lastname),
      congregationId,
    },
  })
  await syncBuiltInRoleAssignments(db, member.id, congregationId, actorId)
  return member
}

export type UpdateIdentityParams = MemberFormFields

// `email` here is the Member's contact email — the login email lives on
// UserAccount and is managed via the link-login flow, not here.
export async function updateIdentity(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdateIdentityParams,
) {
  const before = await _loadMemberIdentity(db, id, congregationId)

  // No `select:` here — `haveIdentityFlagsChanged` below diffs `before` against
  // this row's identity fields. Adding a `select` that omits any of the 8
  // fields in MEMBER_IDENTITY_SELECT would silently break the diff (every
  // omitted field reads as `undefined !== value`, always forcing a sync).
  const member = await db.member.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id, congregationId } },
    data: memberDataFromForm(params),
  })

  if (haveIdentityFlagsChanged(before, member)) {
    await syncBuiltInRoleAssignments(db, id, congregationId, actorId)
  }

  audit({
    action: AuditAction.PublisherUpdated,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: id,
  })

  return member
}

export async function togglePublisher(
  db: TransactionClient,
  memberId: MemberId,
  congregationId: number,
  isPublisher: boolean,
  actorId: number,
) {
  const existing = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { id: true },
  })
  if (!existing) throw new NotFoundError('Member')

  const member = await db.member.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id: memberId, congregationId } },
    data: { isPublisher },
  })

  await syncBuiltInRoleAssignments(db, memberId, congregationId, actorId)

  audit({
    action: AuditAction.PublisherStatusChanged,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
    metadata: { isPublisher },
  })

  return member
}

export type LifecycleState = 'left' | 'returned' | 'active' | 'inactive'

const LIFECYCLE_MUTATION: Record<
  LifecycleState,
  { field: 'leftAt' | 'inactiveAt'; setNull: boolean; action: AuditAction; syncsRoles: boolean }
> = {
  left: { field: 'leftAt', setNull: false, action: AuditAction.MemberLeft, syncsRoles: true },
  returned: { field: 'leftAt', setNull: true, action: AuditAction.MemberReturned, syncsRoles: true },
  inactive: { field: 'inactiveAt', setNull: false, action: AuditAction.PublisherInactivated, syncsRoles: false },
  active: { field: 'inactiveAt', setNull: true, action: AuditAction.PublisherReactivated, syncsRoles: false },
}

// Back after more than a year away: welcomed like a new arrival, from the return date.
function arrivalUpdate(state: LifecycleState, leftAt: Date | null, at: Date | undefined) {
  const arrivedAt = state === 'returned' ? arrivalOnReturn(leftAt, at ?? new Date()) : null
  return arrivedAt ? { arrivedAt } : {}
}

export async function setLifecycle(
  db: TransactionClient,
  memberId: MemberId,
  congregationId: number,
  actorId: number,
  state: LifecycleState,
  trigger?: string,
  at?: Date,
) {
  const spec = LIFECYCLE_MUTATION[state]
  // Full row (no select) so the idempotent early-return below has the same
  // shape as the mutating path — callers reading e.g. `member.leftAt` on the
  // no-op branch must get a real value, not undefined.
  const current = await db.member.findFirst({
    where: { id: memberId, congregationId },
    include: state === 'left' ? { account: { select: { id: true } } } : undefined,
  })
  if (!current) throw new NotFoundError('Member')

  const currentValue = current[spec.field]
  if (spec.setNull ? currentValue == null : currentValue != null) return current

  const updated = await db.member.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id: memberId, congregationId } },
    data: { [spec.field]: spec.setNull ? null : (at ?? new Date()), ...arrivalUpdate(state, current.leftAt, at) },
  })

  if (spec.syncsRoles) await syncBuiltInRoleAssignments(db, memberId, congregationId, actorId)

  if (state === 'left') {
    const account = (current as { account?: { id: number } | null }).account
    if (account) await db.userRoleAssignment.deleteMany({ where: { userId: account.id } })
  }

  audit({
    action: spec.action,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
    ...(trigger != null || !spec.syncsRoles ? { metadata: { trigger: trigger ?? 'manual' } } : {}),
  })

  return updated
}

export async function updateAccountName(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  actorId: number,
  firstname: string,
  lastname: string,
) {
  const member = await db.member.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id: memberId, congregationId } },
    data: {
      firstname,
      lastname,
      firstnameNormalized: stripDiacritics(firstname),
      lastnameNormalized: stripDiacritics(lastname),
    },
  })

  await syncBuiltInRoleAssignments(db, memberId, congregationId, actorId)

  return member
}

/**
 * Puts a member in a field service group, or in none with `null`. A group's overseer and deputy
 * belong to the group they lead, so this refuses to take them out of it: their group's leaders have
 * to change first. Throws a ConflictError whose message says so.
 */
export async function setGroup(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  groupId: number | null,
  actorId: number,
): Promise<void> {
  const member = await _loadGroupMembership(db, memberId, congregationId)
  if (member.publisherGroupId === groupId) return

  const led = member.responsibleFor ?? member.deputyFor
  if (led && led.id !== groupId) {
    throw new ConflictError(m.groups_members_error_leads_group({ person: formatPersonName(member), name: led.name }))
  }

  await db.member.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id: memberId, congregationId } },
    data: { publisherGroupId: groupId },
  })

  audit({
    action: AuditAction.PublisherGroupMembershipChanged,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
    metadata: { from: member.publisherGroupId, to: groupId },
  })
}

/** Records the latest pastoral visit, or clears it with `null`. Throws NotFoundError outside the congregation. */
export async function setLastPastoralVisit(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  visitedOn: Date | null,
  actorId: number,
): Promise<void> {
  const found = await db.member.findFirst({ where: { id: memberId, congregationId }, select: { id: true } })
  if (!found) throw new NotFoundError('Member')
  // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
  const where = { id_congregationId: { id: memberId, congregationId } }
  await db.member.update({ where, data: { lastPastoralVisitAt: visitedOn } })
  audit({
    action: AuditAction.PastoralVisitRecorded,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
    metadata: { cleared: visitedOn === null },
  })
}

export async function anonymize(
  db: TransactionClient,
  memberId: MemberId,
  congregationId: number,
  actorId: number,
): Promise<void> {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { id: true, anonymizedAt: true, leftAt: true },
  })
  if (!member) throw new NotFoundError('Member')
  if (member.anonymizedAt) return
  await _ensureMemberIsNotGroupResponsible(db, memberId)

  await db.member.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id: memberId, congregationId } },
    data: {
      firstname: 'Utilisateur',
      lastname: 'supprime',
      firstnameNormalized: stripDiacritics('Utilisateur'),
      lastnameNormalized: stripDiacritics('supprime'),
      phone: '',
      address: '',
      email: '',
      birthDate: null,
      baptismDate: null,
      arrivedAt: null,
      lastPastoralVisitAt: null,
      isMale: null,
      isHelder: false,
      isServant: false,
      isAnointed: false,
      publisherGroupId: null,
      anonymizedAt: new Date(),
      ...(member.leftAt == null ? { leftAt: new Date() } : {}),
    },
  })

  await db.publisherGroup.updateMany({ where: { deputyId: memberId }, data: { deputyId: null } })
  // Emergency contacts hold third-party PII and anonymize is an UPDATE, so the
  // FK cascade never fires — remove them explicitly.
  await purgeEmergencyContacts(db, memberId, congregationId)
  await syncBuiltInRoleAssignments(db, memberId, congregationId, null)

  await db.dataDeletionRecord.create({
    data: {
      entityType: 'Member',
      entityId: memberId,
      congregationId,
      requestedBy: `admin:${actorId}`,
      completedAt: new Date(),
    },
  })
  audit({ action: AuditAction.UserAnonymized, congregationId, actorId, entityType: 'Member', entityId: memberId })
}
