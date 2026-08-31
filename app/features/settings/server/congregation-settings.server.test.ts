import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    congregation: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('~/shared/domain/settings.server', () => ({
  setSetting: vi.fn(),
}))
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('~/features/publishers/index.server', () => ({
  endOngoingEnrolmentsOfType: vi.fn(),
}))

const { updateCongregationSettings } = await import('./congregation-settings.server')
const { setSetting } = await import('~/shared/domain/settings.server')
const { endOngoingEnrolmentsOfType } = await import('~/features/publishers/index.server')

const mockDb = {
  member: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.member.findMany.mockResolvedValue([])
})

describe('updateCongregationSettings', () => {
  it('sets the auxiliary pioneer setting', async () => {
    vi.mocked(setSetting).mockResolvedValue(undefined as never)

    await updateCongregationSettings(mockDb as never, 10, 99, {
      auxiliaryPioneerProfileActivated: 'true',
    })

    expect(setSetting).toHaveBeenCalledWith(mockDb, 'auxiliary-pioneer-profile-active', 'true', 10)
    expect(endOngoingEnrolmentsOfType).not.toHaveBeenCalled()
  })

  // Deactivating the profile means those members stop being permanent auxiliaries. That fact lives
  // on the stint now, so the setting closes the ongoing ones instead of flipping a cached column.
  // Re-syncing each affected member's roles is guaranteed inside endOngoingEnrolmentsOfType and
  // covered by pioneer-enrolment.workflow.integration.test.ts — the regression this file used to
  // guard (a bulk type flip that skipped the role sync) cannot recur, because there is no bulk flip.
  it('closes ongoing auxiliary enrolments when the profile is deactivated', async () => {
    vi.mocked(setSetting).mockResolvedValue(undefined as never)

    await updateCongregationSettings(mockDb as never, 10, 99, {
      auxiliaryPioneerProfileActivated: 'false',
    })

    expect(endOngoingEnrolmentsOfType).toHaveBeenCalledWith(
      mockDb,
      10,
      99,
      PublisherType.PionnierAuxiliaires,
      expect.objectContaining({ endMonth: expect.any(Number), endYear: expect.any(Number) }),
    )
  })
})
