import { createPasswordResetToken } from '~/features/authentication'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import { LimitService } from '~/shared/domain/limits.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'
import type { PublisherType } from '~/shared/types/publisher-type'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import {
  haveIdentityFlagsChanged,
  MEMBER_IDENTITY_SELECT,
  type MemberFormFields,
  type MemberIdentityFlags,
  memberDataFromForm,
} from './member-identity'

async function _loadMemberIdentity(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
): Promise<MemberIdentityFlags> {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: MEMBER_IDENTITY_SELECT,
  })
  if (!member) throw new NotFoundError('Member')
  return member
}

export type CreateMemberParams = MemberFormFields & {
  email: string | null
  congregationId: number
  actorId: number
}

export async function createMember(db: TransactionClient, congregation: CongregationInfo, params: CreateMemberParams) {
  const limits = new LimitService(db, congregation)
  await limits.errorIfWouldGoOverLimit('members')

  const member = await db.member.create({
    data: { ...memberDataFromForm(params), isPublisher: true, congregationId: params.congregationId },
  })

  if (params.email && params.email.length > 0) {
    const account = await db.userAccount.create({
      data: {
        memberId: member.id,
        email: params.email.toLocaleLowerCase(),
        password: '',
        active: true,
        emailVerifiedAt: new Date(),
        congregationId: params.congregationId,
      },
    })
    await createPasswordResetToken(account.id, db)
  }

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

export type CreateDirectParams = {
  firstname: string
  lastname: string
  isMale: boolean | null
  birthDate: Date | null
  baptismDate: Date | null
  isPublisher: boolean
  type: PublisherType
  isHelder: boolean
  isServant: boolean
  isAnointed: boolean
  publisherGroupId: number | null
  phone: string
  address: string
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

export type UpdateIdentityParams = MemberFormFields & { email: string | null }

export async function updateIdentity(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdateIdentityParams,
) {
  const before = await _loadMemberIdentity(db, id, congregationId)

  const member = await db.member.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id, congregationId } },
    data: memberDataFromForm(params),
  })

  if (params.email && params.email.length > 0) {
    const account = await db.userAccount.findUnique({ where: { memberId: id } })
    if (account) {
      await db.userAccount.update({
        where: { id: account.id },
        data: { email: params.email.toLocaleLowerCase() },
      })
    }
  }

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

export async function setLifecycle(
  db: TransactionClient,
  memberId: MemberId,
  congregationId: number,
  actorId: number,
  state: LifecycleState,
  trigger?: string,
) {
  const spec = LIFECYCLE_MUTATION[state]
  const current = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { id: true, [spec.field]: true, account: state === 'left' ? { select: { id: true } } : false },
  })
  if (!current) throw new NotFoundError('Member')

  const currentValue = (current as Record<string, unknown>)[spec.field] as Date | null
  if (spec.setNull ? currentValue == null : currentValue != null) return current

  const updated = await db.member.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id: memberId, congregationId } },
    data: { [spec.field]: spec.setNull ? null : new Date() },
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
    where: { id: memberId },
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
      birthDate: null,
      baptismDate: null,
      isMale: null,
      isHelder: false,
      isServant: false,
      isAnointed: false,
      anonymizedAt: new Date(),
      // Anonymize implies gone from the congregation. Flip leftAt unless
      // the member was already marked left.
      ...(member.leftAt == null ? { leftAt: new Date() } : {}),
    },
  })

  await db.publisherGroup.updateMany({ where: { deputyId: memberId }, data: { deputyId: null } })
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

  audit({
    action: AuditAction.UserAnonymized,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
  })
}

export async function bulkUpdateType(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  from: PublisherType,
  to: PublisherType,
): Promise<void> {
  const affected = await db.member.findMany({
    where: { congregationId, type: from },
    select: { id: true },
  })

  await db.member.updateMany({ where: { congregationId, type: from }, data: { type: to } })

  for (const m of affected) {
    await syncBuiltInRoleAssignments(db, m.id, congregationId, actorId)
  }
}
