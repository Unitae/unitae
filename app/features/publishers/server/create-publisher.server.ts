import type { CongregationInfo } from '~/shared/libs/congregation.server'
import type { TransactionClient } from '~/shared/libs/db.server'
import { LimitService } from '~/shared/libs/limits.server'

export interface CreatePublisherParams {
  firstname: string
  lastname: string
  email: string | null
  gender: string
  birthDate: string | null
  baptismDate: string | null
  isHelder: boolean
  isServant: boolean
  isAnointed: boolean
  groupId: number | null
  type: string
  congregationId: number
}

export async function createPublisher(db: TransactionClient, congregation: CongregationInfo, params: CreatePublisherParams) {
  const limits = new LimitService(db, congregation)
  await limits.errorIfWouldGoOverLimit('publishers')

  const email =
    params.email && params.email.length > 0
      ? params.email
      : `${params.firstname}.${params.lastname}@placeholder.unitae.app`.toLowerCase()

  return db.user.create({
    data: {
      firstname: params.firstname,
      lastname: params.lastname,
      email,
      active: true,
      password: 'password',
      emailVerifiedAt: new Date(),
      isPublisher: true,
      isMale: params.gender === 'male',
      baptismDate: params.baptismDate ? new Date(params.baptismDate) : null,
      birthDate: params.birthDate ? new Date(params.birthDate) : null,
      isHelder: params.isHelder,
      isServant: params.isServant,
      isAnointed: params.isAnointed,
      publisherGroupId: Number.isNaN(params.groupId) ? null : params.groupId,
      type: params.type,
      congregationId: params.congregationId,
    },
  })
}
