import type { TransactionClient } from '~/shared/infra/db.server'

// Read side for emergency info (CQRS-lite): no mutations here.

const CONTACT_SELECT = {
  id: true,
  name: true,
  relationship: true,
  phone: true,
} as const

// Loads a member's emergency info for the dedicated emergency page / detail
// card: the two flags, the contacts, plus the fields the access check
// (`publisherGroupId`) and the page header (`firstname`/`lastname`) need.
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

// Loads active members with their emergency info for the printable rosters,
// optionally scoped to a single group. Sorted like the publisher list.
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
