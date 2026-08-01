import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/publishers/index.server', () => ({
  getPioneerActivitySummary: vi.fn(),
}))

const { getAtRiskPioneers } = await import('./get-at-risk-pioneers.server')
const { getPioneerActivitySummary } = await import('~/features/publishers/index.server')

const NOW = new Date(2026, 0, 15)

function annualRow(memberId: number, bucket: 'green' | 'amber' | 'red', paceDelta: number, concluded = false) {
  return {
    memberId,
    firstname: `F${memberId}`,
    lastname: `L${memberId}`,
    concluded,
    pace: { riskBucket: bucket, paceDelta },
  }
}

beforeEach(() => vi.resetAllMocks())

describe('getAtRiskPioneers', () => {
  it('returns only red-bucket, non-concluded pioneers with their deficit', async () => {
    vi.mocked(getPioneerActivitySummary).mockResolvedValue({
      serviceYear: 2025,
      annual: [
        annualRow(1, 'red', -80),
        annualRow(2, 'green', 10),
        annualRow(3, 'red', -40),
        annualRow(4, 'red', -200, true), // concluded → excluded
      ],
      auxiliary: [],
      totals: { onTrack: 1, behind: 0, atRisk: 2, actualHours: 0, targetHours: 0 },
    } as never)

    const result = await getAtRiskPioneers({} as never, 42, NOW)

    expect(result.count).toBe(2)
    expect(result.pioneers.map(p => p.memberId)).toEqual([1, 3])
    expect(result.pioneers[0].deficit).toBe(80)
  })
})
