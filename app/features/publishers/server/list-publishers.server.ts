import type { Prisma } from '~/database/generated/client'
import {
  findLastAssignmentsForMembers,
  findNextAbsencesForMembers,
  type LastAssignment,
  type NextAbsence,
} from '~/features/events/index.server'
import type { Privilege, PublisherListFilters } from '~/features/publishers/model/publisher-list-filters'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { CongregationId, MemberId } from '~/shared/types/branded'
import { PublisherType } from '~/shared/types/publisher-type'

export interface PublisherListRow {
  id: number
  firstname: string
  lastname: string
  /** For the feminine form of the pioneer tags. */
  isMale: boolean | null
  group: { id: number; name: string } | null
  privileges: Privilege[]
  leftAt: Date | null
  lastAssignment: LastAssignment | null
  /** Null as well for viewers who may not see absences. */
  nextAbsence: NextAbsence | null
}

const PIONEER_PRIVILEGE: Record<Exclude<PublisherType, 'Normal'>, Privilege> = {
  [PublisherType.PionnierPermanant]: 'regular-pioneer',
  [PublisherType.PionnierAuxiliaires]: 'auxiliary-pioneer',
  [PublisherType.PionnierSpecial]: 'special-pioneer',
  [PublisherType.Missionnaire]: 'missionary',
}

const PIONEER_TYPE = Object.fromEntries(
  Object.entries(PIONEER_PRIVILEGE).map(([type, privilege]) => [privilege, type as PublisherType]),
) as Partial<Record<Privilege, PublisherType>>

interface PrivilegeSource {
  isHelder: boolean
  isServant: boolean
  /** Ongoing stints only. */
  pioneerEnrolments: { type: PublisherType }[]
}

/** Appointments first, then the ongoing pioneer service, as the tags read. */
export function privilegesOf(member: PrivilegeSource): Privilege[] {
  const privileges: Privilege[] = []
  if (member.isHelder) privileges.push('elder')
  if (member.isServant) privileges.push('servant')
  for (const { type } of member.pioneerEnrolments) {
    if (type !== PublisherType.Normal) privileges.push(PIONEER_PRIVILEGE[type])
  }
  return privileges
}

const STATUS_WHERE = {
  active: { leftAt: null, inactiveAt: null },
  inactive: { leftAt: null, inactiveAt: { not: null } },
  // Anonymised rows have no identity left to show.
  left: { leftAt: { not: null }, anonymizedAt: null },
} satisfies Record<PublisherListFilters['status'], Prisma.MemberWhereInput>

function privilegeWhere(privilege: Privilege | null): Prisma.MemberWhereInput {
  if (privilege == null) return {}
  if (privilege === 'elder') return { isHelder: true }
  if (privilege === 'servant') return { isServant: true }
  // A pioneer is one with an ongoing stint of that type, as the activity filters read it.
  return { pioneerEnrolments: { some: { type: PIONEER_TYPE[privilege], endMonth: null } } }
}

/** The groups chosen, « Sans groupe » among them. Both at once nest their OR, the name search having its own. */
function groupWhere({ groupIds, noGroup }: PublisherListFilters): Prisma.MemberWhereInput {
  if (groupIds.length === 0) return noGroup ? { publisherGroupId: null } : {}
  if (!noGroup) return { publisherGroupId: { in: groupIds } }
  return { AND: [{ OR: [{ publisherGroupId: { in: groupIds } }, { publisherGroupId: null }] }] }
}

export function publisherListWhere(congregationId: number, filters: PublisherListFilters): Prisma.MemberWhereInput {
  return {
    congregationId,
    isPublisher: true,
    ...STATUS_WHERE[filters.status],
    ...groupWhere(filters),
    ...privilegeWhere(filters.privilege),
    ...(filters.search !== ''
      ? {
          OR: [
            { firstname: { contains: filters.search, mode: 'insensitive' as const } },
            { lastname: { contains: filters.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }
}

/** How many publishers each list holds (active, inactive, left) under the same search, groups and privilege. */
export async function countPublishersByStatus(
  db: TransactionClient,
  congregationId: number,
  filters: PublisherListFilters,
): Promise<Record<PublisherListFilters['status'], number>> {
  const [active, inactive, left] = await Promise.all(
    (['active', 'inactive', 'left'] as const).map(status =>
      db.member.count({ where: publisherListWhere(congregationId, { ...filters, status }) }),
    ),
  )
  return { active, inactive, left }
}

/**
 * The publishers page: one row per publisher with their group, privileges, last part and, for
 * viewers allowed to see absences, their next one. Sorted by name; those who left, latest first.
 */
export async function listPublishers(
  db: TransactionClient,
  congregationId: number,
  filters: PublisherListFilters,
  options: { includeAbsences: boolean; now?: Date },
): Promise<PublisherListRow[]> {
  const now = options.now ?? new Date()
  const members = await db.member.findMany({
    where: publisherListWhere(congregationId, filters),
    select: {
      id: true,
      firstname: true,
      lastname: true,
      isMale: true,
      isHelder: true,
      isServant: true,
      leftAt: true,
      publisherGroup: { select: { id: true, name: true } },
      pioneerEnrolments: { where: { endMonth: null }, select: { type: true } },
    },
    orderBy:
      filters.status === 'left'
        ? [{ leftAt: 'desc' }, { lastname: 'asc' }, { firstname: 'asc' }]
        : [{ lastname: 'asc' }, { firstname: 'asc' }],
  })

  const ids = members.map(member => member.id as MemberId)
  const congregation = congregationId as CongregationId
  const [lastAssignments, nextAbsences] = await Promise.all([
    findLastAssignmentsForMembers(db, ids, congregation, now),
    options.includeAbsences && filters.status !== 'left'
      ? findNextAbsencesForMembers(db, ids, congregation, now)
      : Promise.resolve(new Map<MemberId, NextAbsence>()),
  ])

  return members.map(member => ({
    id: member.id,
    firstname: member.firstname,
    lastname: member.lastname,
    isMale: member.isMale,
    group: member.publisherGroup,
    privileges: privilegesOf(member),
    leftAt: member.leftAt,
    lastAssignment: lastAssignments.get(member.id as MemberId) ?? null,
    nextAbsence: nextAbsences.get(member.id as MemberId) ?? null,
  }))
}
