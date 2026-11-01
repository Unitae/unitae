import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Audit is fire-and-forget; keep it out of the database.
vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  AuditAction: {
    PublisherGroupCreated: 'publisher.group.created',
    PublisherGroupUpdated: 'publisher.group.updated',
    PublisherGroupMembershipChanged: 'publisher.group.membership_changed',
  },
}))

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

const { updateGroup } = await import('./update-group.server')
const { createPublisherGroup } = await import('./publisher-group-mutations.server')
const { ValidationError } = await import('~/shared/errors/app-error.server')

const ts = Date.now()
let congId: number
let seq = 0

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `GroupWrites ${ts}`, slug: `group-writes-${ts}`, active: true },
  })
  congId = cong.id
})

afterAll(async () => {
  await testDb.member.updateMany({ where: { congregationId: congId }, data: { publisherGroupId: null } })
  await testDb.publisherGroup.deleteMany({ where: { congregationId: congId } })
  await testDb.member.deleteMany({ where: { congregationId: congId } })
  await testDb.congregation.deleteMany({ where: { id: congId } })
  await testDb.$disconnect()
})

function elder(groupId: number | null = null) {
  seq += 1
  return testDb.member.create({
    data: {
      firstname: `Elder${seq}`,
      lastname: `${ts}`,
      isMale: true,
      isHelder: true,
      // The schema requires an elder to be a baptized brother (member_elder_requires_baptized_male).
      baptismDate: new Date('2000-01-01'),
      isPublisher: true,
      congregationId: congId,
      publisherGroupId: groupId,
    },
  })
}

function sister(groupId: number | null = null) {
  seq += 1
  return testDb.member.create({
    data: {
      firstname: `Sister${seq}`,
      lastname: `${ts}`,
      isMale: false,
      isPublisher: true,
      congregationId: congId,
      publisherGroupId: groupId,
    },
  })
}

async function groupLedBy(responsibleId: number, deputyId: number | null = null) {
  seq += 1
  const group = await testDb.publisherGroup.create({
    data: { name: `G${seq}-${ts}`, adress: 'x', responsibleId, deputyId, congregationId: congId },
  })
  const leaders = deputyId != null ? [responsibleId, deputyId] : [responsibleId]
  await testDb.member.updateMany({ where: { id: { in: leaders } }, data: { publisherGroupId: group.id } })
  return group
}

async function groupOf(memberId: number) {
  return (await testDb.member.findUniqueOrThrow({ where: { id: memberId } })).publisherGroupId
}

function update(groupId: number, responsibleId: number, deputyId: number | null) {
  return withScope(congId, tx =>
    updateGroup(tx, groupId, congId, 1, { name: 'Renamed', address: 'x', responsibleId, deputyId }),
  )
}

describe('updateGroup (integration)', () => {
  it('moves a newly chosen deputy into the group', async () => {
    const group = await groupLedBy((await elder()).id)
    const other = await groupLedBy((await elder()).id)
    const deputy = await elder(other.id)

    await update(group.id, group.responsibleId, deputy.id)

    expect(await groupOf(deputy.id)).toBe(group.id)
  })

  it('lets the overseer and the deputy swap places', async () => {
    const overseer = await elder()
    const deputy = await elder()
    const group = await groupLedBy(overseer.id, deputy.id)

    await update(group.id, deputy.id, overseer.id)

    const saved = await testDb.publisherGroup.findUniqueOrThrow({ where: { id: group.id } })
    expect([saved.responsibleId, saved.deputyId]).toEqual([deputy.id, overseer.id])
  })

  // Regression: a hand-made request made a sister the deputy and moved her out of her own group.
  it('refuses a sister as deputy and writes nothing', async () => {
    const group = await groupLedBy((await elder()).id)
    const home = await groupLedBy((await elder()).id)
    const ineligible = await sister(home.id)

    await expect(update(group.id, group.responsibleId, ineligible.id)).rejects.toBeInstanceOf(ValidationError)

    const saved = await testDb.publisherGroup.findUniqueOrThrow({ where: { id: group.id } })
    expect(saved.deputyId).toBeNull()
    expect(saved.name).not.toBe('Renamed')
    expect(await groupOf(ineligible.id)).toBe(home.id)
  })

  // Regression: the unique constraint on responsibleId answered with a 500.
  it("refuses another group's overseer on the overseer field", async () => {
    const group = await groupLedBy((await elder()).id)
    const other = await groupLedBy((await elder()).id)

    const refusal = await update(group.id, other.responsibleId, null).catch((error: unknown) => error)

    expect(refusal).toBeInstanceOf(ValidationError)
    expect((refusal as InstanceType<typeof ValidationError>).field).toBe('responsible')
  })
})

describe('createPublisherGroup (integration)', () => {
  it('creates the group and moves its leaders into it', async () => {
    const home = await groupLedBy((await elder()).id)
    const overseer = await elder(home.id)

    const group = await withScope(congId, tx =>
      createPublisherGroup(tx, {
        name: 'New',
        address: 'x',
        responsibleId: overseer.id,
        deputyId: null,
        congregationId: congId,
        actorId: 1,
      }),
    )

    expect(await groupOf(overseer.id)).toBe(group.id)
  })
})
