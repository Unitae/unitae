import { type ActivityMonth, reportWindow } from '~/features/publishers/model/activity-months'
import { emergencyGaps, pastoralSignals, reportStatus } from '~/features/publishers/model/member-signals'
import { reportProgress } from '~/features/publishers/model/report-progress'
import type { TransactionClient } from '~/shared/infra/db.server'
import { zonedNow } from '~/shared/utils/zoned-now'

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

export interface GroupListAsOf {
  timezone: string
  now?: Date
  /** Whether to count last month's reports: only for those who may see the activity. */
  withReports: boolean
}

/**
 * The groups of the congregation by name, for the groups list: their leaders' names, how many publishers are in each
 * and how many of them are inactive, and, `withReports`, the last ended month's reports among those who are not
 * inactive, counted as the group page counts them. Months follow the congregation's calendar (`timezone`).
 */
export async function listGroups(
  db: TransactionClient,
  congregationId: number,
  { timezone, now = new Date(), withReports }: GroupListAsOf,
) {
  const month = reportWindow(zonedNow(timezone, now)).at(-1) as ActivityMonth
  const groups = await db.publisherGroup.findMany({
    where: { congregationId },
    select: {
      id: true,
      name: true,
      adress: true,
      responsible: { select: PERSON_NAME },
      deputy: { select: PERSON_NAME },
      members: {
        where: ACTIVE_PUBLISHER,
        select: {
          inactiveAt: true,
          createdAt: true,
          activities: { where: month, select: { isPublisher: true }, take: 1 },
        },
      },
    },
    orderBy: [{ name: 'asc' }],
  })

  return groups.map(({ adress, members, ...group }) => {
    const active = members.filter(member => member.inactiveAt == null)
    const statuses = active.map(member => {
      const added = zonedNow(timezone, member.createdAt)
      return reportStatus(member.activities[0], month, { month: added.getMonth(), year: added.getFullYear() })
    })
    return {
      ...group,
      address: adress,
      publisherCount: members.length,
      inactiveCount: members.length - active.length,
      reports: withReports ? { month, ...reportProgress(statuses) } : null,
    }
  })
}

/** How many active publishers are in no group: the groups list points to them. */
export function countPublishersWithoutGroup(db: TransactionClient, congregationId: number) {
  return db.member.count({
    where: {
      congregationId,
      isPublisher: true,
      leftAt: null,
      inactiveAt: null,
      anonymizedAt: null,
      publisherGroupId: null,
    },
  })
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

// A person the group form offers, with the group they lead (held back elsewhere) and the one they are in (said
// beside their name: choosing them moves them from it).
const CANDIDATE = {
  ...PERSON_NAME,
  responsibleFor: { select: GROUP_NAME },
  deputyFor: { select: GROUP_NAME },
  publisherGroup: { select: GROUP_NAME },
} as const

type CandidateRow = { publisherGroup: { id: number; name: string } | null }
const withGroup = <T extends CandidateRow>({ publisherGroup, ...person }: T) => ({ ...person, group: publisherGroup })

/** The brothers who may lead a group, by name, with the group each already oversees or assists and the one each is in. */
export async function findGroupLeaderCandidates(db: TransactionClient, congregationId: number) {
  const rows = await db.member.findMany({
    where: { congregationId, ...GROUP_LEADER_WHERE },
    select: CANDIDATE,
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
  return rows.map(withGroup)
}

export interface GroupAsOf {
  timezone: string
  now?: Date
}

/**
 * A group with its publishers and, for each one, what the group page shows: the report status of
 * each month of the window (`reportWindow`, the six ended months), the pastoral signals and the
 * missing emergency information. The dates and flags these are computed from stay here: the page
 * gets the result, never a birth or baptism date. Inactive publishers come in `inactiveMembers`:
 * the board's field service groups document leaves them out (it lists `inactiveAt: null` only), so
 * the page shows them apart. Months and dates follow the congregation's calendar (`timezone`).
 */
export async function getGroup(
  db: TransactionClient,
  groupId: number,
  congregationId: number,
  { timezone, now = new Date() }: GroupAsOf,
) {
  const today = zonedNow(timezone, now)
  const window = reportWindow(today)
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
          baptismDate: true,
          arrivedAt: true,
          lastPastoralVisitAt: true,
          createdAt: true,
          dpaCardUpToDate: true,
          survivalBackpackReady: true,
          _count: { select: { emergencyContacts: true } },
          activities: {
            where: { OR: window },
            select: { id: true, month: true, year: true, isPublisher: true },
            orderBy: { id: 'desc' },
          },
        },
      },
    },
  })

  if (group == null) {
    return null
  }

  // Timestamps (inactive since, added on) read on the congregation's calendar. Date-only fields
  // (baptism, arrival, visit) are stored at UTC midnight: they read as that calendar day, which a
  // timezone conversion would move to the day before west of Greenwich.
  const local = (date: Date | null) => (date ? zonedNow(timezone, date) : null)
  const day = (date: Date | null) =>
    date ? new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) : null
  const rows = group.members.map(member => {
    const added = zonedNow(timezone, member.createdAt)
    const expectedFrom = { month: added.getMonth(), year: added.getFullYear() }
    return {
      inactive: member.inactiveAt != null,
      member: {
        id: member.id,
        firstname: member.firstname,
        lastname: member.lastname,
        email: member.email,
        lastPastoralVisitAt: member.lastPastoralVisitAt,
        reports: window.map(target => {
          const report = member.activities.find(each => each.year === target.year && each.month === target.month)
          return { ...target, status: reportStatus(report, target, expectedFrom), id: report?.id ?? null }
        }),
        signals: pastoralSignals(today, {
          inactiveAt: local(member.inactiveAt),
          baptismDate: day(member.baptismDate),
          arrivedAt: day(member.arrivedAt),
          lastPastoralVisitAt: day(member.lastPastoralVisitAt),
        }),
        emergencyGaps: emergencyGaps({
          dpaCardUpToDate: member.dpaCardUpToDate,
          survivalBackpackReady: member.survivalBackpackReady,
          emergencyContactCount: member._count.emergencyContacts,
        }),
      },
    }
  })

  return {
    id: group.id,
    name: group.name,
    address: group.adress,
    responsible: group.responsible,
    deputy: group.deputy,
    reportWindow: window,
    members: rows.filter(row => !row.inactive).map(row => row.member),
    inactiveMembers: rows.filter(row => row.inactive).map(row => row.member),
  }
}

/** The group's publishers by name, for the edit page, saying who is inactive (never since when). */
export async function listGroupMembers(db: TransactionClient, groupId: number, congregationId: number) {
  const rows = await db.member.findMany({
    where: { congregationId, publisherGroupId: groupId, ...ACTIVE_PUBLISHER },
    select: { ...PERSON_NAME, inactiveAt: true },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
  return rows.map(({ inactiveAt, ...person }) => ({ ...person, inactive: inactiveAt != null }))
}

/**
 * The active publishers outside the group who could join it (every one for a group being created, `null`), with the
 * group each leads (those are held back: a leader stays in his own group) and the one each is in.
 */
export async function findGroupMemberCandidates(db: TransactionClient, congregationId: number, groupId: number | null) {
  const rows = await db.member.findMany({
    where: {
      congregationId,
      ...ACTIVE_PUBLISHER,
      anonymizedAt: null,
      // Spelled out: SQL's NOT never matches a null, so `NOT groupId` would drop the publishers in
      // no group at all.
      ...(groupId == null ? {} : { OR: [{ publisherGroupId: null }, { publisherGroupId: { not: groupId } }] }),
    },
    select: CANDIDATE,
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
  return rows.map(withGroup)
}
