interface ActivityMonth {
  month: number
  year: number
}

type ReportStatus = 'filed' | 'irregular' | 'not-filed' | 'not-expected'

interface GroupMember {
  id: number
  firstname: string | null
  lastname: string | null
  reports: (ActivityMonth & { status: ReportStatus })[]
  signals: { kind: string; since?: ActivityMonth }[]
  emergencyGaps: string[]
}

/** The shape the group page's query returns; summarised here for the overseer's dashboard block. */
export interface GroupLike {
  id: number
  name: string
  reportWindow: ActivityMonth[]
  members: GroupMember[]
  inactiveMembers: GroupMember[]
}

export interface GroupSummary {
  id: number
  name: string
  memberCount: number
  /** The month whose reports are being collected; null only for an empty window. */
  month: ActivityMonth | null
  reports: {
    expected: number
    received: number
    missing: { id: number; firstname: string | null; lastname: string | null }[]
  }
  /** Welcome visits to plan. */
  newArrivals: number
  /** First baptism anniversaries coming up. */
  anniversaries: number
  inactive: { count: number; since: ActivityMonth | null }
  /** Publishers missing at least one piece of emergency information. */
  incompleteEmergency: number
}

const ordinal = ({ month, year }: ActivityMonth) => year * 12 + month

/**
 * What a group overseer has to act on, from the same data the group page shows: reports still
 * missing for the month being collected, visits to plan, inactive publishers, and incomplete
 * emergency information. Inactive publishers are set apart, as on the page, and not chased for
 * reports.
 */
export function summarizeGroup(group: GroupLike): GroupSummary {
  const month = group.reportWindow.at(-1) ?? null
  const statusFor = (member: GroupMember) =>
    month == null
      ? 'not-expected'
      : (member.reports.find(r => r.month === month.month && r.year === month.year)?.status ?? 'not-expected')
  const expected = group.members.filter(member => statusFor(member) !== 'not-expected')
  const missing = expected.filter(member => statusFor(member) === 'not-filed')
  const signalCount = (kind: string) => group.members.filter(m => m.signals.some(s => s.kind === kind)).length
  const inactiveSince = group.inactiveMembers
    .flatMap(member => member.signals.filter(s => s.kind === 'inactive' && s.since != null).map(s => s.since))
    .filter((since): since is ActivityMonth => since != null)
    .sort((a, b) => ordinal(a) - ordinal(b))

  return {
    id: group.id,
    name: group.name,
    memberCount: group.members.length,
    month,
    reports: {
      expected: expected.length,
      received: expected.length - missing.length,
      missing: missing.map(({ id, firstname, lastname }) => ({ id, firstname, lastname })),
    },
    newArrivals: signalCount('new-arrival'),
    anniversaries: signalCount('baptism-anniversary'),
    inactive: { count: group.inactiveMembers.length, since: inactiveSince[0] ?? null },
    incompleteEmergency: [...group.members, ...group.inactiveMembers].filter(m => m.emergencyGaps.length > 0).length,
  }
}
