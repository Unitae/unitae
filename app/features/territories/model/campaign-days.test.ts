import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/runtime', () => ({ getLocale: () => 'fr' }))
vi.mock('~/i18n/paraglide/messages', () => ({
  campaigns_range: ({ start, end }: { start: string; end: string }) => `Du ${start} au ${end}`,
}))

const { formatCampaignRange } = await import('./campaign-days')

describe('formatCampaignRange', () => {
  it('names the month once when the campaign stays in it, and leaves out this year', () => {
    expect(formatCampaignRange('2026-11-02', '2026-11-29', 2026)).toBe('Du lun. 2 au dim. 29 novembre')
  })

  it('names both months when it runs over two', () => {
    expect(formatCampaignRange('2026-10-26', '2026-11-08', 2026)).toBe('Du lun. 26 oct. au dim. 8 novembre')
  })

  it('gives the year of a campaign from another year', () => {
    expect(formatCampaignRange('2025-11-02', '2025-11-29', 2026)).toBe('Du dim. 2 au sam. 29 novembre 2025')
  })
})
