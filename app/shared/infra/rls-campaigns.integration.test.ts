import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

type Tx = Parameters<Parameters<typeof testDb.$transaction>[0]>[0]

function withScope<T>(congregationId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return testDb.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}

const ts = Date.now()
let congregationIdA: number
let congregationIdB: number
let campaignIdA: number
let campaignIdB: number
let territoryIdB: number

async function seedCongregation(name: string, slug: string) {
  const cong = await testDb.congregation.create({ data: { name, slug, active: true } })

  return withScope(cong.id, async tx => {
    const territory = await tx.territory.create({
      data: { number: `RLS-${slug}`, congregationId: cong.id },
    })
    const campaign = await tx.campaign.create({
      data: {
        name: `Campagne ${name}`,
        startDate: new Date(2026, 0, 15),
        endDate: new Date(2026, 2, 1),
        congregationId: cong.id,
      },
    })
    await tx.campaignTerritory.create({
      data: { campaignId: campaign.id, territoryId: territory.id, congregationId: cong.id },
    })
    return { congregationId: cong.id, campaignId: campaign.id, territoryId: territory.id }
  })
}

beforeAll(async () => {
  const a = await seedCongregation(`RLS Campaign A ${ts}`, `rls-campaign-a-${ts}`)
  const b = await seedCongregation(`RLS Campaign B ${ts}`, `rls-campaign-b-${ts}`)
  congregationIdA = a.congregationId
  congregationIdB = b.congregationId
  campaignIdA = a.campaignId
  campaignIdB = b.campaignId
  territoryIdB = b.territoryId
})

afterAll(async () => {
  for (const congId of [congregationIdA, congregationIdB]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.campaignTerritory.deleteMany({})
      await tx.campaign.deleteMany({})
      await tx.territory.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [congregationIdA, congregationIdB] } } })
  await testDb.$disconnect()
})

describe('RLS isolation for Campaign', () => {
  it('ne retourne que les campagnes de la congrégation A quand le scope est A', async () => {
    const campaigns = await withScope(congregationIdA, tx => tx.campaign.findMany())

    expect(campaigns.map(c => c.id)).toEqual([campaignIdA])
    expect(campaigns.every(c => c.congregationId === congregationIdA)).toBe(true)
  })

  it('empêche la congrégation A de voir les campagnes de la congrégation B', async () => {
    const campaigns = await withScope(congregationIdA, tx => tx.campaign.findMany({ where: { id: campaignIdB } }))

    expect(campaigns).toHaveLength(0)
  })

  it('empêche la congrégation A de modifier une campagne de la congrégation B', async () => {
    const result = await withScope(congregationIdA, tx =>
      tx.campaign.updateMany({ where: { id: campaignIdB }, data: { name: 'Piratée' } }),
    )

    expect(result.count).toBe(0)
  })
})

describe('RLS isolation for CampaignTerritory', () => {
  it('ne retourne que la portée de la congrégation A quand le scope est A', async () => {
    const scope = await withScope(congregationIdA, tx => tx.campaignTerritory.findMany())

    expect(scope.map(s => s.campaignId)).toEqual([campaignIdA])
    expect(scope.every(s => s.congregationId === congregationIdA)).toBe(true)
  })

  it('empêche la congrégation A de voir la portée de la congrégation B', async () => {
    const scope = await withScope(congregationIdA, tx =>
      tx.campaignTerritory.findMany({ where: { campaignId: campaignIdB, territoryId: territoryIdB } }),
    )

    expect(scope).toHaveLength(0)
  })
})
