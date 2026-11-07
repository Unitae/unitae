import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Permission } from '~/shared/types/permission'

vi.mock('~/shared/infra/logger.server', () => ({ default: { error: vi.fn() } }))
vi.mock('./dashboard.server', () => ({
  getUserTerritories: vi.fn(),
  getRecentDocuments: vi.fn(),
  getUnreadDocumentCount: vi.fn(),
  getUpcomingAbsences: vi.fn(),
  getConflictingAssignments: vi.fn(),
}))
vi.mock('./get-upcoming-assignments.server', () => ({ getUpcomingAssignments: vi.fn() }))
vi.mock('./get-responsible-conflicts.server', () => ({ getResponsibleConflicts: vi.fn() }))
vi.mock('./get-at-risk-pioneers.server', () => ({ getAtRiskPioneers: vi.fn() }))
vi.mock('./get-management-metrics.server', () => ({ getManagementMetrics: vi.fn() }))
vi.mock('./get-onboarding-progress.server', () => ({ getOnboardingProgress: vi.fn() }))
vi.mock('./next-meeting-for-viewer.server', () => ({ nextMeetingForViewer: vi.fn() }))
vi.mock('./get-open-parts.server', () => ({ getOpenParts: vi.fn() }))
vi.mock('./get-report-progress.server', () => ({ getReportProgress: vi.fn() }))
vi.mock('./get-roll-changes.server', () => ({ getRollChanges: vi.fn() }))
vi.mock('./has-held-territory.server', () => ({ hasHeldTerritory: vi.fn() }))
vi.mock('./has-calendar-feed.server', () => ({ hasCalendarFeed: vi.fn() }))
vi.mock('~/features/publishers/server/groups.server', () => ({ getGroup: vi.fn() }))
vi.mock('~/features/events/server/events-auth.server', () => ({ getResponsibleTemplateIds: vi.fn() }))

const { loadDashboard } = await import('./load-dashboard.server')
const dashboard = await import('./dashboard.server')
const { getUpcomingAssignments } = await import('./get-upcoming-assignments.server')
const { getManagementMetrics } = await import('./get-management-metrics.server')
const { getOnboardingProgress } = await import('./get-onboarding-progress.server')
const { nextMeetingForViewer } = await import('./next-meeting-for-viewer.server')
const { getOpenParts } = await import('./get-open-parts.server')
const { getReportProgress } = await import('./get-report-progress.server')
const { getRollChanges } = await import('./get-roll-changes.server')
const { hasHeldTerritory } = await import('./has-held-territory.server')
const { hasCalendarFeed } = await import('./has-calendar-feed.server')
const { getGroup } = await import('~/features/publishers/server/groups.server')
const { getResponsibleTemplateIds } = await import('~/features/events/server/events-auth.server')

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
  vi.mocked(dashboard.getRecentDocuments).mockResolvedValue([] as never)
  vi.mocked(dashboard.getUnreadDocumentCount).mockResolvedValue(0)
  vi.mocked(dashboard.getUpcomingAbsences).mockResolvedValue({ upcoming: [], shouldNudge: false } as never)
  vi.mocked(dashboard.getConflictingAssignments).mockResolvedValue(null as never)
  vi.mocked(getUpcomingAssignments).mockResolvedValue([])
  vi.mocked(nextMeetingForViewer).mockResolvedValue(null)
  vi.mocked(hasHeldTerritory).mockResolvedValue(false)
  vi.mocked(hasCalendarFeed).mockResolvedValue(true)
})

describe('loadDashboard', () => {
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
    const data = await load([Permission.CanViewTerritories, Permission.CanViewTerritoryAttributions])
    expect(data.territories).toEqual({ data: { total: 20, assigned: 15, late: 3 } })
    expect(data.roll).toBeNull()
  })

  it('gives the secretary the report progress and the roll keeper the roll', async () => {
    vi.mocked(getReportProgress).mockResolvedValue({
      month: { month: 9, year: 2026 },
      expected: 45,
      received: 38,
      incompleteGroups: 2,
    })
    vi.mocked(getRollChanges).mockResolvedValue({ total: 45, arrived: 2, left: 1 })
    const data = await load([Permission.CanViewActivity, Permission.CanViewPublishers, Permission.CanManagePublishers])
    expect(data.activity?.progress).toEqual({
      data: { month: { month: 9, year: 2026 }, expected: 45, received: 38, incompleteGroups: 2 },
    })
    expect(data.roll).toEqual({ data: { total: 45, arrived: 2, left: 1 } })
  })

  it('shows no programme block to someone who answers for no meeting type', async () => {
    vi.mocked(getResponsibleTemplateIds).mockResolvedValue([])
    expect((await load([Permission.CanViewPrograms])).programmes).toBeNull()
  })

  it('lists open slots for every meeting to someone who may assign any part', async () => {
    vi.mocked(getOpenParts).mockResolvedValue([
      { eventId: 1, name: 'Réunion de semaine', startDate: new Date(), isDraft: false, count: 2 },
    ])
    const data = await load([Permission.CanViewPrograms, Permission.CanAssignProgramParts])
    expect(data.programmes?.data).toHaveLength(1)
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
  })
})
