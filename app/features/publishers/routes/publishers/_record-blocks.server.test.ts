import { describe, expect, it, vi } from 'vitest'
import type { PublisherRecordRights } from '~/features/publishers/model/publisher-record-access'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'

// The record's blocks: each read only when the reader may see it, and handed over without what they may not, so the
// page never carries a territory's notes or the emergency row's other columns.

const reads = vi.hoisted(() => [] as string[])
const read =
  <T>(name: string, value: T) =>
  () => {
    reads.push(name)
    return value
  }

vi.mock('~/features/events/index.server', () => ({
  findUpcomingAssignmentsForMember: vi.fn(read('assignments', [])),
  findUpcomingAbsencesForMember: vi.fn(read('absences', [])),
}))
vi.mock('~/features/territories/index.server', () => ({
  findActiveAttributionsForPublisher: vi.fn(
    read('attributions', [
      {
        id: 3,
        territoryId: 14,
        startDate: new Date('2027-01-03T00:00:00Z'),
        lateDate: new Date('2027-05-03T00:00:00Z'),
        pausedAt: null,
        territory: { number: '14', type: 'classical', notes: 'Chien méchant au 12' },
      },
    ]),
  ),
}))
vi.mock('~/features/publishers/server/emergency.queries', () => ({
  getEmergencyInfoForMember: vi.fn(
    read('emergency', {
      id: 12,
      firstname: 'Patrick',
      lastname: 'Fontaine',
      publisherGroupId: 3,
      dpaCardUpToDate: true,
      survivalBackpackReady: false,
      emergencyContacts: [],
    }),
  ),
}))
vi.mock('~/features/publishers/server/list-theocratic-years-with-activity.server', () => ({
  listTheocraticYearsWithActivity: vi.fn(read('s21', [2026])),
}))
vi.mock('~/features/publishers/server/pioneer-activity.queries', () => ({
  getPioneerActivityForMember: vi.fn(read('activity', null)),
}))
vi.mock('~/features/publishers/server/pioneer-enrolment.queries', () => ({
  getEnrolmentsForMember: vi.fn(read('enrolments', [])),
}))
vi.mock('~/features/publishers/server/publisher-record.queries', () => ({
  getEnrolmentOptions: vi.fn(read('options', null)),
  getRecordReportMonths: vi.fn(read('reports', [])),
}))

const { loadRecordBlocks } = await import('./_record-blocks.server')

const NONE: PublisherRecordRights = {
  canEdit: false,
  canManageLogin: false,
  canManageLifecycle: false,
  isSelf: false,
  canDownloadS21: false,
  canViewActivity: false,
  canSeeEnrolments: false,
  canManageEnrolments: false,
  canViewAttributions: false,
  canOpenTerritories: false,
  canViewPrograms: false,
  canViewAbsences: false,
  canViewEmergency: false,
  canManageEmergency: false,
  canRecordVisit: false,
}
const scope = {
  publisherId: 12 as MemberId,
  congregationId: 1,
  pioneerYear: 2026,
  serviceYear: 2026,
  timeZone: 'Europe/Paris',
  withReports: false,
  now: new Date(2027, 2, 16),
  clock: new Date('2027-03-16T10:00:00Z'),
}
const db = {} as TransactionClient

describe('loadRecordBlocks', () => {
  it('reads nothing a reader of publishers alone may not see', async () => {
    reads.length = 0
    const blocks = await loadRecordBlocks(db, NONE, scope)
    expect(reads).toEqual([])
    expect(blocks).toMatchObject({
      activity: null,
      territories: [],
      assignments: null,
      absences: null,
      emergency: null,
    })
  })

  it('hands over each block a reader may see, without the territory’s notes or the emergency row’s other columns', async () => {
    reads.length = 0
    const all = {
      ...NONE,
      canViewActivity: true,
      canSeeEnrolments: true,
      canViewAttributions: true,
      canViewEmergency: true,
    }
    const blocks = await loadRecordBlocks(db, all, { ...scope, withReports: true })

    expect(reads.sort()).toEqual(['activity', 'attributions', 'emergency', 'enrolments', 'reports'])
    expect(blocks.territories).toEqual([
      expect.objectContaining({ number: '14', type: 'classical', lateDate: new Date('2027-05-03T00:00:00Z') }),
    ])
    expect(JSON.stringify(blocks.territories)).not.toContain('Chien')
    expect(blocks.emergency).toEqual({ dpaCardUpToDate: true, survivalBackpackReady: false, emergencyContacts: [] })
  })
})
