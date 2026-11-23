import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Permission } from '~/shared/types/permission'

vi.mock('~/shared/infra/logger.server', () => ({
  default: { error: vi.fn() },
  createLogger: () => ({ warn: vi.fn() }),
}))
vi.mock('./dashboard.server', () => ({
  getUserTerritories: vi.fn(),
  getBoardDocuments: vi.fn(),
  getUpcomingAbsences: vi.fn(),
  getConflictingAssignments: vi.fn(),
}))
vi.mock('./get-upcoming-assignments.server', () => ({ getUpcomingAssignments: vi.fn() }))
vi.mock('./get-responsible-conflicts.server', () => ({ getResponsibleConflicts: vi.fn() }))
vi.mock('./get-at-risk-pioneers.server', () => ({ getAtRiskPioneers: vi.fn() }))
vi.mock('./get-management-metrics.server', () => ({ getManagementMetrics: vi.fn() }))
vi.mock('./get-onboarding-progress.server', () => ({ getOnboardingProgress: vi.fn() }))
vi.mock('./next-meeting-for-viewer.server', () => ({ nextMeetingForViewer: vi.fn() }))
vi.mock('./get-open-parts.server', () => ({ getOpenParts: vi.fn(), programmeResponsibleRoleIds: vi.fn() }))
vi.mock('./get-report-progress.server', () => ({ getReportProgress: vi.fn() }))
vi.mock('./get-roll-changes.server', () => ({ getRollChanges: vi.fn() }))
vi.mock('./get-territory-trend.server', () => ({ getTerritoryTrend: vi.fn() }))
vi.mock('./has-held-territory.server', () => ({ hasHeldTerritory: vi.fn() }))
vi.mock('./has-calendar-feed.server', () => ({ hasCalendarFeed: vi.fn() }))
vi.mock('~/features/publishers/server/groups.server', () => ({ getGroup: vi.fn() }))
vi.mock('~/shared/auth/permissions.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/permissions.server')>()),
  resolveEffectiveRoleIds: vi.fn(),
}))
vi.mock('~/features/events/index.server', () => ({ listMeetingsUnderWay: vi.fn() }))
vi.mock('~/features/events/server/schedule-rights.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/features/events/server/schedule-rights.server')>()),
  responsibleKindIds: vi.fn(),
}))

const { loadDashboard } = await import('./load-dashboard.server')
const dashboard = await import('./dashboard.server')
const { getUpcomingAssignments } = await import('./get-upcoming-assignments.server')
const { getManagementMetrics } = await import('./get-management-metrics.server')
const { getOnboardingProgress } = await import('./get-onboarding-progress.server')
const { nextMeetingForViewer } = await import('./next-meeting-for-viewer.server')
const { getOpenParts, programmeResponsibleRoleIds } = await import('./get-open-parts.server')
const { getReportProgress } = await import('./get-report-progress.server')
const { getRollChanges } = await import('./get-roll-changes.server')
const { getTerritoryTrend } = await import('./get-territory-trend.server')
const { hasHeldTerritory } = await import('./has-held-territory.server')
const { hasCalendarFeed } = await import('./has-calendar-feed.server')
const { getGroup } = await import('~/features/publishers/server/groups.server')
const { resolveEffectiveRoleIds } = await import('~/shared/auth/permissions.server')
const { listMeetingsUnderWay } = await import('~/features/events/index.server')
const { responsibleKindIds } = await import('~/features/events/server/schedule-rights.server')

const db = {} as never
const congregation = { id: 1, timezone: 'Europe/Paris' }

type Member = {
  id: number
  firstname: string | null
  publisherGroupId: number | null
  responsibleFor: { id: number } | null
  deputyFor: { id: number } | null
}

function account(member: Partial<Member> | null = {}, overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    firstname: null,
    twoFactorEnabledAt: null,
    onboardingDismissedAt: null,
    member:
      member == null
        ? null
        : { id: 42, firstname: 'Karine', publisherGroupId: 7, responsibleFor: null, deputyFor: null, ...member },
    ...overrides,
  }
}

function load(permissions: Permission[], acc = account()) {
  return loadDashboard(db, { account: acc, permissions: new Set(permissions), congregation })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(dashboard.getUserTerritories).mockResolvedValue([] as never)
  vi.mocked(dashboard.getBoardDocuments).mockResolvedValue({ recent: [], unread: 0 })
  vi.mocked(dashboard.getUpcomingAbsences).mockResolvedValue({ upcoming: [], shouldNudge: false } as never)
  vi.mocked(dashboard.getConflictingAssignments).mockResolvedValue(null as never)
  vi.mocked(getUpcomingAssignments).mockResolvedValue([])
  vi.mocked(nextMeetingForViewer).mockResolvedValue(null)
  vi.mocked(hasHeldTerritory).mockResolvedValue(false)
  vi.mocked(hasCalendarFeed).mockResolvedValue(true)
})

describe('loadDashboard', () => {
  // From the start of a meeting to midnight, the people who count get its card — nobody else, and nothing outside it.
  it('gives the hall usher the meetings under way with what the card needs, and nothing outside a meeting', async () => {
    const meeting = { eventId: 40, name: 'Réunion du week-end' }
    vi.mocked(listMeetingsUnderWay).mockResolvedValue([meeting] as never)

    const data = await load([Permission.CanRecordAttendance])
    expect(data.attendance).toMatchObject({
      meetings: [meeting],
      viewer: { actorId: 3, canRecord: true, canCorrect: false, timeZone: 'Europe/Paris' },
    })

    vi.mocked(listMeetingsUnderWay).mockResolvedValue([])
    expect((await load([Permission.CanRecordAttendance])).attendance).toBeNull()

    vi.mocked(listMeetingsUnderWay).mockClear()
    expect((await load([Permission.CanViewPrograms])).attendance).toBeNull()
    expect(listMeetingsUnderWay).not.toHaveBeenCalled()
  })

  it('gives a publisher their own blocks and documents, and no congregation block', async () => {
    const data = await load([Permission.CanViewBoard])
    expect(data.personal).not.toBeNull()
    expect(data.documents).toEqual({ data: { recent: [], unread: 0 } })
    expect(data.group).toBeNull()
    expect(data.activity).toBeNull()
    expect(data.roll).toBeNull()
    expect(data.territories).toBeNull()
    expect(data.programmes).toBeNull()
  })

  it('gives an account without a member record no personal blocks', async () => {
    const data = await load([Permission.CanViewBoard], account(null))
    expect(data.personal).toBeNull()
  })

  it('hides « Mes territoires » from someone who never held a territory', async () => {
    expect((await load([Permission.CanViewBoard])).personal?.showTerritories).toBe(false)

    vi.mocked(hasHeldTerritory).mockResolvedValue(true)
    expect((await load([Permission.CanViewBoard])).personal?.showTerritories).toBe(true)
  })

  it('keeps « Mes territoires » for someone holding one now', async () => {
    vi.mocked(dashboard.getUserTerritories).mockResolvedValue([{ id: 1 }] as never)
    expect((await load([Permission.CanViewBoard])).personal?.showTerritories).toBe(true)
  })

  it("summarises the overseer's group from the group page data", async () => {
    vi.mocked(getGroup).mockResolvedValue({
      id: 7,
      name: 'Nord',
      reportWindow: [{ month: 9, year: 2026 }],
      members: [],
      inactiveMembers: [],
    } as never)
    const data = await load([], account({ responsibleFor: { id: 7 } }))
    expect(data.group).toMatchObject({ data: { id: 7, name: 'Nord', canRecord: true } })
  })

  it('gives the territory servant the territory figures only', async () => {
    vi.mocked(getManagementMetrics).mockResolvedValue({
      territories: { total: 20, assigned: 15, late: 3 },
      publishers: null,
    })
    const trend = { out: [14, 15], late: [4, 3], monthAgo: { out: 14, late: 4 } }
    vi.mocked(getTerritoryTrend).mockResolvedValue(trend)
    const data = await load([Permission.CanViewTerritories, Permission.CanViewTerritoryAttributions])
    expect(data.territories).toEqual({ data: { total: 20, assigned: 15, late: 3, trend } })
    expect(data.roll).toBeNull()
  })

  it('keeps the territory figures when only their trend fails', async () => {
    vi.mocked(getManagementMetrics).mockResolvedValue({
      territories: { total: 20, assigned: 15, late: 3 },
      publishers: null,
    })
    vi.mocked(getTerritoryTrend).mockRejectedValue(new Error('boom'))
    const data = await load([Permission.CanViewTerritories, Permission.CanViewTerritoryAttributions])
    expect(data.territories).toEqual({ data: { total: 20, assigned: 15, late: 3, trend: null } })
  })

  it('gives the secretary the report progress and the roll keeper the roll', async () => {
    const progress = {
      month: { month: 9, year: 2026 },
      expected: 45,
      received: 38,
      incompleteGroups: 2,
      previous: { month: { month: 8, year: 2026 }, expected: 45, received: 44, incompleteGroups: 1 },
    }
    vi.mocked(getReportProgress).mockResolvedValue(progress)
    vi.mocked(getRollChanges).mockResolvedValue({ total: 45, arrived: 2, left: 1 })
    const data = await load([Permission.CanViewActivity, Permission.CanViewPublishers, Permission.CanManagePublishers])
    expect(data.activity?.progress).toEqual({ data: progress })
    expect(data.roll).toEqual({ data: { total: 45, arrived: 2, left: 1 } })
  })

  it('offers creating programmes to a responsible of some kind, and to no one when the lookup fails', async () => {
    vi.mocked(responsibleKindIds).mockResolvedValue([4])
    expect((await load([Permission.CanViewPrograms])).visibility.programmes).toEqual({ canCreate: true })
    vi.mocked(responsibleKindIds).mockResolvedValue([])
    expect((await load([Permission.CanViewPrograms])).visibility.programmes).toEqual({ canCreate: false })
    vi.mocked(responsibleKindIds).mockRejectedValue(new Error('boom'))
    expect((await load([Permission.CanViewPrograms])).visibility.programmes).toEqual({ canCreate: false })
  })

  describe('« Programmes »', () => {
    // The open slots of every meeting, or of the programmes answered for by role 7 alone.
    const slot = (eventId: number) => ({ eventId, name: 'Réunion', startDate: new Date(), isDraft: false, count: 2 })
    beforeEach(() => {
      vi.mocked(getOpenParts).mockImplementation((_db, _congregationId, { roleIds }) =>
        Promise.resolve(roleIds == null ? [slot(1), slot(2)] : roleIds.includes(7) ? [slot(2)] : []),
      )
    })
    const shown = async (permissions: Permission[]) =>
      (await load([Permission.CanViewPrograms, ...permissions])).programmes?.data?.map(row => row.eventId)

    it('lists every meeting to whoever fills every schedule, « Attribuer » or « Gérer »', async () => {
      expect(await shown([Permission.CanAssignProgramParts])).toEqual([1, 2])
      expect(await shown([Permission.CanManagePrograms])).toEqual([1, 2])
    })

    it('lists a programme’s responsible the meetings they answer for', async () => {
      vi.mocked(programmeResponsibleRoleIds).mockResolvedValue([7])
      expect(await shown([])).toEqual([2])
    })

    it('shows no block to someone who answers for no programme, roles or not', async () => {
      vi.mocked(resolveEffectiveRoleIds).mockResolvedValue([3, 4])
      vi.mocked(programmeResponsibleRoleIds).mockResolvedValue([])
      expect((await load([Permission.CanViewPrograms])).programmes).toBeNull()
    })

    it('reports a failed lookup as an error, never every meeting', async () => {
      vi.mocked(programmeResponsibleRoleIds).mockRejectedValue(new Error('boom'))
      expect((await load([Permission.CanViewPrograms])).programmes).toEqual({ data: null })
    })
  })

  it('reports a failed block as such and still serves the others', async () => {
    vi.mocked(getRollChanges).mockRejectedValue(new Error('boom'))
    const data = await load([Permission.CanManagePublishers, Permission.CanViewPublishers, Permission.CanViewBoard])
    expect(data.roll).toEqual({ data: null })
    expect(data.documents).toEqual({ data: { recent: [], unread: 0 } })
  })

  describe('« Premiers pas »', () => {
    it('asks a member to subscribe to their calendar, in their assignments, only while they have no feed', async () => {
      vi.mocked(hasCalendarFeed).mockResolvedValue(false)
      const data = await load([Permission.CanViewBoard])
      expect(data.personal?.needsCalendar).toBe(true)
      // Asked once, where it helps: never again in the checklist.
      expect(data.setup).toBeNull()

      vi.mocked(hasCalendarFeed).mockResolvedValue(true)
      expect((await load([Permission.CanViewBoard])).personal?.needsCalendar).toBe(false)
    })

    it('suggests two-factor sign-in only to someone holding a responsibility, until enabled', async () => {
      const responsible = [Permission.CanViewBoard, Permission.CanViewPublishers]
      expect((await load(responsible)).setup?.personal).toEqual(['two-factor'])
      expect(await load(responsible, account({}, { twoFactorEnabledAt: new Date() }))).toMatchObject({ setup: null })
    })

    it('lists only the setup steps still to do, and nothing once the congregation is set up', async () => {
      vi.mocked(getOnboardingProgress).mockResolvedValue({
        steps: { ownRecord: true, publishers: true, groups: false, logins: true, territories: false },
        complete: false,
      })
      const admin = account({}, { twoFactorEnabledAt: new Date() })
      expect((await load(Object.values(Permission), admin)).setup?.admin).toEqual(['groups', 'territories'])

      vi.mocked(getOnboardingProgress).mockResolvedValue({
        steps: { ownRecord: true, publishers: true, groups: true, logins: true, territories: true },
        complete: true,
      })
      expect((await load(Object.values(Permission), admin)).setup).toBeNull()
    })

    it('stays closed once dismissed', async () => {
      const dismissed = account({}, { onboardingDismissedAt: new Date() })
      expect((await load([Permission.CanViewBoard, Permission.CanViewPublishers], dismissed)).setup).toBeNull()
    })

    // A demo copy refuses /me/security and is filled already: nothing to set up there.
    it('never opens in a demo copy', async () => {
      vi.mocked(getOnboardingProgress).mockResolvedValue({
        steps: { ownRecord: true, publishers: true, groups: false, logins: true, territories: false },
        complete: false,
      })
      const result = await loadDashboard(db, {
        account: account(),
        permissions: new Set(Object.values(Permission)),
        congregation: { ...congregation, demo: true },
      })
      expect(result.setup).toBeNull()
    })
  })
})
