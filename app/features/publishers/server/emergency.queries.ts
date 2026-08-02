import type { TransactionClient } from '~/shared/infra/db.server'

const CONTACT_SELECT = {
  id: true,
  name: true,
  relationship: true,
  phone: true,
} as const

// `publisherGroupId` is selected for the caller's access check, not for display.
export function getEmergencyInfoForMember(db: TransactionClient, memberId: number, congregationId: number) {
  return db.member.findFirst({
    where: { id: memberId, congregationId },
    select: {
      id: true,
      firstname: true,
      lastname: true,
      publisherGroupId: true,
      dpaCardUpToDate: true,
      survivalBackpackReady: true,
      emergencyContacts: { select: CONTACT_SELECT, orderBy: { id: 'asc' } },
    },
  })
}

export type EmergencyRosterScope = { groupId?: number }

export function getPublishersWithEmergencyInfo(
  db: TransactionClient,
  congregationId: number,
  scope: EmergencyRosterScope = {},
) {
  return db.member.findMany({
    where: {
      congregationId,
      leftAt: null,
      ...(scope.groupId != null ? { publisherGroupId: scope.groupId } : {}),
    },
    select: {
      id: true,
      firstname: true,
      lastname: true,
      phone: true,
      address: true,
      email: true,
      dpaCardUpToDate: true,
      survivalBackpackReady: true,
      publisherGroup: { select: { name: true } },
      emergencyContacts: { select: CONTACT_SELECT, orderBy: { id: 'asc' } },
    },
    orderBy: [{ lastnameNormalized: 'asc' }, { firstnameNormalized: 'asc' }],
  })
}
