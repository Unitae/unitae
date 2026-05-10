import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { createTestCongregation, createTestUser } from '~/tests/factories'
import { buildActivityPdfZip, getPublishersWithYearActivities } from './render-activity-pdf-zip.server'

vi.mock('@react-pdf/renderer', () => ({
  pdf: () => ({ toBuffer: () => Promise.resolve(Buffer.from('fake-pdf')) }),
  Document: ({ children }: { children: unknown }) => children,
  Page: ({ children }: { children: unknown }) => children,
  View: ({ children }: { children: unknown }) => children,
  Text: ({ children }: { children: unknown }) => children,
  Svg: ({ children }: { children: unknown }) => children,
  Polygon: () => null,
  StyleSheet: { create: <T>(s: T) => s },
  Font: { register: () => undefined },
}))

const TRANSACTION_ERROR_RE = /transaction/i

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

let congregationId: number
const publisherIds: number[] = []

beforeAll(async () => {
  const congregation = await createTestCongregation(testDb)
  congregationId = congregation.id

  const publisherCount = 8
  for (let i = 0; i < publisherCount; i++) {
    const user = await createTestUser(testDb, congregationId, {
      isPublisher: true,
      firstname: `Publisher${i}`,
      lastname: `Last${i}`,
    })
    publisherIds.push(user.id)
    await testDb.publisherActivity.create({
      data: {
        publisherId: user.id,
        congregationId,
        month: 8,
        year: 2025,
        isPublisher: true,
        hours: 1,
      },
    })
  }
})

afterAll(async () => {
  await testDb.publisherActivity.deleteMany({ where: { congregationId } })
  await testDb.userAccount.deleteMany({ where: { congregationId } })
  await testDb.congregation.deleteMany({ where: { id: congregationId } })
  await testDb.$disconnect()
})

describe('activity PDF export — transaction lifecycle', () => {
  it('completes the fetch within a 500ms transaction budget and renders PDFs after commit', async () => {
    const publishers = await testDb.$transaction(
      async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        return getPublishersWithYearActivities(tx, congregationId, 2025)
      },
      { timeout: 500 },
    )

    expect(publishers).toHaveLength(publisherIds.length)

    const buffer = await buildActivityPdfZip(publishers)

    expect(buffer).toBeInstanceOf(ArrayBuffer)
    expect(buffer.byteLength).toBeGreaterThan(0)
  })

  it('would fail if PDF rendering ran inside the same 500ms transaction', async () => {
    await expect(
      testDb.$transaction(
        async tx => {
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const publishers = await getPublishersWithYearActivities(tx, congregationId, 2025)
          await new Promise(resolve => setTimeout(resolve, 700))
          return buildActivityPdfZip(publishers)
        },
        { timeout: 500 },
      ),
    ).rejects.toThrow(TRANSACTION_ERROR_RE)
  })
})
