import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { PublisherType } from '~/shared/types/publisher-type'

export interface UpdatePublisherParams {
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
  type: PublisherType
  phone: string
  address: string
}

export async function updatePublisher(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdatePublisherParams,
) {
  const publisher = await db.user.update({
    where: {
      id_congregationId: { id, congregationId },
    },
    data: {
      firstname: params.firstname,
      lastname: params.lastname,
      isMale: params.gender === 'male',
      baptismDate: params.baptismDate ? new Date(params.baptismDate) : null,
      birthDate: params.birthDate ? new Date(params.birthDate) : null,
      isHelder: params.isHelder,
      isServant: params.isServant,
      isAnointed: params.isAnointed,
      publisherGroupId: Number.isNaN(params.groupId) ? null : params.groupId,
      ...(params.email ? { email: params.email } : {}),
      type: params.type,
      address: params.address,
      phone: params.phone,
    },
  })

  audit({
    action: AuditAction.PublisherUpdated,
    congregationId,
    actorId,
    entityType: 'User',
    entityId: id,
  })

  return publisher
}
