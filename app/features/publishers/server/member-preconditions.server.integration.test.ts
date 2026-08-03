import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { _ensureMemberIsNotGroupResponsible, _loadMemberIdentity } from './member-preconditions.server'

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
let congId: number
let memberId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Precond ${ts}`, slug: `precond-${ts}`, active: true },
  })
  congId = cong.id
  const member = await withScope(congId, tx =>
    tx.member.create({
      data: {
        firstname: 'Pre',
        lastname: 'Cond',
        isPublisher: true,
        type: PublisherType.Normal,
        congregationId: congId,
      },
    }),
  )
  memberId = member.id
})

afterAll(async () => {
  await withScope(congId, async tx => {
    await tx.publisherGroup.deleteMany({ where: { congregationId: congId } })
    await tx.member.deleteMany({ where: { congregationId: congId } })
  })
  await testDb.congregation.delete({ where: { id: congId } })
  await testDb.$disconnect()
})

describe('_loadMemberIdentity', () => {
  it('returns the identity flags for an existing member', async () => {
    const flags = await withScope(congId, tx => _loadMemberIdentity(tx, memberId, congId))
    expect(flags.isPublisher).toBe(true)
    expect(flags.type).toBe(PublisherType.Normal)
  })

  it('throws NotFoundError for a missing member', async () => {
    await expect(withScope(congId, tx => _loadMemberIdentity(tx, 999_999, congId))).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})

describe('_ensureMemberIsNotGroupResponsible', () => {
  it('resolves when the member is not a group responsible', async () => {
    await expect(withScope(congId, tx => _ensureMemberIsNotGroupResponsible(tx, memberId))).resolves.toBeUndefined()
  })

  it('throws ConflictError when the member is a group`s responsible', async () => {
    const responsible = await withScope(congId, tx =>
      tx.member.create({
        data: {
          firstname: 'Resp',
          lastname: 'Person',
          isPublisher: true,
          type: PublisherType.Normal,
          congregationId: congId,
        },
      }),
    )
    await withScope(congId, tx =>
      tx.publisherGroup.create({
        data: { name: `Grp-${ts}`, adress: '', responsibleId: responsible.id, congregationId: congId },
      }),
    )
    await expect(
      withScope(congId, tx => _ensureMemberIsNotGroupResponsible(tx, responsible.id)),
    ).rejects.toBeInstanceOf(ConflictError)
  })
})
