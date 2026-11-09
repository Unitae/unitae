import { describe, expect, it, vi } from 'vitest'

// Regression: the territory's own holder may download its PDF without the right to see every
// territory. The guard compared Attribution.publisherId (a Member FK) with the login account's id,
// so a holder whose two ids differ was refused from the button on their own « Mes territoires » page.

const ACCOUNT_ID = 775
const MEMBER_ID = 1164
const OTHER_MEMBER_ID = 2210
const TERRITORY_ID = 33

const { currentAccountContext, permissionsContext, holder } = vi.hoisted(() => ({
  currentAccountContext: Symbol('currentAccountContext'),
  permissionsContext: Symbol('permissionsContext'),
  holder: { memberId: 0 },
}))

vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn({}),
}))

vi.mock('~/features/territories/server/attributions.server', () => ({
  findTerritoryWithHistory: () =>
    Promise.resolve({
      id: TERRITORY_ID,
      number: 'T01',
      type: 'doors-to-doors',
      entrances: [],
      attributions: [
        {
          endDate: null,
          publisherId: holder.memberId,
          publisher: { firstname: 'Élodie', lastname: 'Martin' },
          lateDate: new Date(2026, 11, 1),
          type: 'default',
          campaignId: null,
        },
      ],
    }),
}))

vi.mock('~/features/territories/server/card-overlays.server', () => ({ listCardOverlays: () => Promise.resolve([]) }))
vi.mock('~/features/territories/server/perimeter.server', () => ({ getPerimeterPaths: () => Promise.resolve([]) }))
vi.mock('~/features/territories/ui/TerritoryDocument', () => ({ TerritoryDocument: () => null }))
vi.mock('~/shared/domain/settings.server', () => ({ getBoolSetting: () => Promise.resolve(false) }))
vi.mock('~/shared/utils/env.server', () => ({ getOptionalEnv: () => undefined }))
vi.mock('~/shared/infra/pdf.server', () => ({
  renderPdfResponse: () => new Response('%PDF', { headers: { 'Content-Type': 'application/pdf' } }),
  sanitizeFilename: (value: string) => value,
}))

// The holder holds no right over territories: only the attribution can let them in.
const context = {
  get: (key: unknown) => {
    if (key === currentAccountContext) return { id: ACCOUNT_ID, congregationId: 42, member: { id: MEMBER_ID } }
    if (key === permissionsContext) return new Set()
    return undefined
  },
}

const { loader } = await import('./pdf-download')

const download = () =>
  loader({
    context,
    params: { territoryId: String(TERRITORY_ID) },
    request: new Request(`http://test/territories/territory/${TERRITORY_ID}/pdf`),
  } as never)

describe('territory PDF download', () => {
  it('lets the member holding the territory download it', async () => {
    holder.memberId = MEMBER_ID

    const response = await download()

    expect(response.headers.get('Content-Type')).toBe('application/pdf')
  })

  it('refuses someone who neither holds it nor may see every territory', async () => {
    holder.memberId = OTHER_MEMBER_ID

    await expect(download()).rejects.toThrow()
  })
})
