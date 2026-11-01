import type { ActivityMonth, ActivityMonths } from '~/features/publishers/model/activity-months'
import type { TransactionClient } from '~/shared/infra/db.server'

import { GROUP_LEADER_WHERE } from './group-leaders.server'

// What the group pages show about a person. Every query below selects field by field: a whole
// Member row carries birth and baptism dates, the emergency flags and contact details, and loader
// data reaches the browser of anyone allowed on the page.
const PERSON_NAME = { id: true, firstname: true, lastname: true } as const
const GROUP_NAME = { id: true, name: true } as const

// Whom a group's publisher count and member list include.
const ACTIVE_PUBLISHER = { isPublisher: true, leftAt: null } as const

export async function getGroups(db: TransactionClient, congregationId: number) {
  return await db.publisherGroup.findMany({ where: { congregationId } })
}

/** The groups of the congregation by name, with their leaders' names and publisher count. */
export async function listGroups(db: TransactionClient, congregationId: number) {
  const groups = await db.publisherGroup.findMany({
    where: { congregationId },
    select: {
      id: true,
      name: true,
      adress: true,
      responsible: { select: PERSON_NAME },
      deputy: { select: PERSON_NAME },
      _count: { select: { members: { where: ACTIVE_PUBLISHER } } },
    },
    orderBy: [{ name: 'asc' }],
  })

  return groups.map(({ adress, _count, ...group }) => ({ ...group, address: adress, publisherCount: _count.members }))
}

/** One group, for its edit and delete pages, with how many active publishers are in it. */
export async function findGroupById(db: TransactionClient, groupId: number, congregationId: number) {
  const group = await db.publisherGroup.findUnique({
    where: { id_congregationId: { id: groupId, congregationId } },
    select: {
      id: true,
      name: true,
      adress: true,
      responsibleId: true,
      deputyId: true,
      _count: { select: { members: { where: ACTIVE_PUBLISHER } } },
    },
  })
  if (group == null) return null

  const { adress, _count, ...rest } = group
  return { ...rest, address: adress, publisherCount: _count.members }
}

/** The brothers who may lead a group, by name, with the group each already oversees or assists. */
export function findGroupLeaderCandidates(db: TransactionClient, congregationId: number) {
  return db.member.findMany({
    where: { congregationId, ...GROUP_LEADER_WHERE },
    select: { ...PERSON_NAME, responsibleFor: { select: GROUP_NAME }, deputyFor: { select: GROUP_NAME } },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
}

/**
 * A group with its publishers and, for each, the report filed for `months.current` and
 * `months.previous`, by id only: the page links to a report, it never shows one. Inactive
 * publishers come in `inactiveMembers`: the board's field service groups document leaves them out
 * (it lists `inactiveAt: null` only), so the page shows them apart.
 */
export async function getGroup(db: TransactionClient, groupId: number, congregationId: number, months: ActivityMonths) {
  const group = await db.publisherGroup.findUnique({
    where: { id_congregationId: { id: groupId, congregationId } },
    select: {
      id: true,
      name: true,
      adress: true,
      responsible: { select: PERSON_NAME },
      deputy: { select: PERSON_NAME },
      members: {
        where: ACTIVE_PUBLISHER,
        orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
        select: {
          ...PERSON_NAME,
          email: true,
          inactiveAt: true,
          activities: {
            where: { OR: [months.previous, months.current] },
            select: { id: true, month: true, year: true },
            orderBy: { id: 'desc' },
          },
        },
      },
    },
  })

  if (group == null) {
    return null
  }

  const reportFor = (activities: { id: number; month: number; year: number }[], target: ActivityMonth) => {
    const report = activities.find(each => each.year === target.year && each.month === target.month)
    return report ? { id: report.id } : undefined
  }

  const rows = group.members.map(({ activities, inactiveAt, ...member }) => ({
    member: {
      ...member,
      currentActivity: reportFor(activities, months.current),
      previousActivity: reportFor(activities, months.previous),
    },
    inactive: inactiveAt != null,
  }))

  return {
    id: group.id,
    name: group.name,
    address: group.adress,
    responsible: group.responsible,
    deputy: group.deputy,
    members: rows.filter(row => !row.inactive).map(row => row.member),
    inactiveMembers: rows.filter(row => row.inactive).map(row => row.member),
  }
}

/** The group's publishers by name, for the membership card of its edit page. */
export function listGroupMembers(db: TransactionClient, groupId: number, congregationId: number) {
  return db.member.findMany({
    where: { congregationId, publisherGroupId: groupId, ...ACTIVE_PUBLISHER },
    select: PERSON_NAME,
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
}

/**
 * The active publishers outside the group who could join it, with the group each leads (those are
 * held back: a leader stays in his own group).
 */
export function findGroupMemberCandidates(db: TransactionClient, congregationId: number, groupId: number) {
  return db.member.findMany({
    where: {
      congregationId,
      ...ACTIVE_PUBLISHER,
      anonymizedAt: null,
      // Spelled out: SQL's NOT never matches a null, so `NOT groupId` would drop the publishers in
      // no group at all.
      OR: [{ publisherGroupId: null }, { publisherGroupId: { not: groupId } }],
    },
    select: { ...PERSON_NAME, responsibleFor: { select: GROUP_NAME }, deputyFor: { select: GROUP_NAME } },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
}
