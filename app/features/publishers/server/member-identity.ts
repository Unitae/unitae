import type { PublisherType } from '~/shared/types/publisher-type'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'

// The 8 fields whose value drives built-in-role assignment. Any mutation
// that touches one must re-run syncBuiltInRoleAssignments.
export type MemberIdentityFlags = {
  isPublisher: boolean
  type: PublisherType
  isMale: boolean | null
  baptismDate: Date | null
  isAnointed: boolean
  isHelder: boolean
  isServant: boolean
  leftAt: Date | null
}

// Params for the direct-create path (linking an existing UserAccount to a
// new Member). Distinct from CreateMemberParams: no email, congregationId
// and actorId are passed positionally by the aggregate function.
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

export const MEMBER_IDENTITY_SELECT = {
  isPublisher: true,
  type: true,
  isMale: true,
  baptismDate: true,
  isAnointed: true,
  isHelder: true,
  isServant: true,
  leftAt: true,
} as const

export function haveIdentityFlagsChanged(before: MemberIdentityFlags, after: MemberIdentityFlags): boolean {
  return (
    before.isPublisher !== after.isPublisher ||
    before.type !== after.type ||
    before.isMale !== after.isMale ||
    (before.baptismDate?.getTime() ?? null) !== (after.baptismDate?.getTime() ?? null) ||
    before.isAnointed !== after.isAnointed ||
    before.isHelder !== after.isHelder ||
    before.isServant !== after.isServant ||
    (before.leftAt?.getTime() ?? null) !== (after.leftAt?.getTime() ?? null)
  )
}

export type MemberFormFields = {
  firstname: string
  lastname: string
  gender: string
  birthDate: string | null
  baptismDate: string | null
  isHelder: boolean
  isServant: boolean
  isAnointed: boolean
  groupId: number | null
  type: PublisherType
  phone: string
  address: string
}

export function memberDataFromForm(params: MemberFormFields) {
  return {
    firstname: params.firstname,
    lastname: params.lastname,
    firstnameNormalized: stripDiacritics(params.firstname),
    lastnameNormalized: stripDiacritics(params.lastname),
    isMale: params.gender === 'male',
    baptismDate: params.baptismDate ? new Date(params.baptismDate) : null,
    birthDate: params.birthDate ? new Date(params.birthDate) : null,
    isHelder: params.isHelder,
    isServant: params.isServant,
    isAnointed: params.isAnointed,
    publisherGroupId: Number.isNaN(params.groupId) ? null : params.groupId,
    type: params.type,
    address: params.address,
    phone: params.phone,
  }
}
