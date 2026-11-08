import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { Permission } from '~/shared/types/permission'

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

const { documentReads, listBoardReaders, sectionAudience } = await import('./board-audience.queries')

const ts = Date.now()
const now = new Date('2026-11-08T12:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000)

let congregationId: number
const roles: Record<string, number> = {}
const accounts: Record<string, number> = {}
let openDocId: number

beforeAll(async () => {
  const congregation = await testDb.congregation.create({
    data: { name: `Board Audience ${ts}`, slug: `board-audience-${ts}`, active: true },
  })
  congregationId = congregation.id
  const permissionId = async (key: Permission) =>
    (await testDb.permission.upsert({ where: { key }, update: {}, create: { key } })).id
  const [viewBoard, doAnything] = await Promise.all([
    permissionId(Permission.CanViewBoard),
    permissionId(Permission.CanDoAnything),
  ])

  await withScope(congregationId, async tx => {
    const role = async (key: string, permissions: number[]) => {
      const created = await tx.role.create({ data: { key: `${key}-${ts}`, isBuiltIn: false, congregationId } })
      for (const id of permissions) {
        await tx.rolePermission.create({ data: { roleId: created.id, permissionId: id, congregationId } })
      }
      roles[key] = created.id
      return created.id
    }
    const viewer = await role('viewer', [viewBoard])
    const elders = await role('elders', [viewBoard])
    const admin = await role('admin', [doAnything])
    const other = await role('other', [])

    const account = async (key: string, extra: Record<string, unknown> = {}) => {
      const created = await tx.userAccount.create({
        data: {
          email: `${key}-${ts}@audience.test`,
          password: 'x',
          firstname: key[0].toUpperCase() + key.slice(1),
          lastname: 'TEST',
          active: true,
          congregationId,
          ...extra,
        },
      })
      accounts[key] = created.id
      return created.id
    }
    const assign = (userId: number, roleId: number) =>
      tx.userRoleAssignment.create({ data: { userId, roleId, congregationId } })

    await assign(await account('alice'), viewer)
    // Bob reads the board through his identity role, held by his member record.
    const bobMember = await tx.member.create({ data: { firstname: 'Bob', lastname: 'TEST', congregationId } })
    await tx.memberRoleAssignment.create({ data: { memberId: bobMember.id, roleId: elders, congregationId } })
    await account('bob', { memberId: bobMember.id, firstname: null, lastname: null })
    await assign(await account('carol'), other)
    await assign(await account('dave'), admin)
    await assign(await account('erin', { active: false }), viewer)
    const leftMember = await tx.member.create({
      data: { firstname: 'Frank', lastname: 'TEST', leftAt: daysAgo(30), congregationId },
    })
    await assign(await account('frank', { memberId: leftMember.id }), viewer)

    const open = await tx.boardSection.create({ data: { name: 'Assemblée', congregationId } })
    const restricted = await tx.boardSection.create({ data: { name: 'Anciens', congregationId } })
    await tx.boardSectionVisibilityRole.create({ data: { sectionId: restricted.id, roleId: elders, congregationId } })

    const doc = await tx.boardDocument.create({
      data: { title: 'Rotation', sectionId: open.id, visibleFrom: daysAgo(20), createdAt: daysAgo(20), congregationId },
    })
    openDocId = doc.id
    await tx.boardDocumentVersion.create({
      data: { documentId: doc.id, uri: 'v2', versionNumber: 2, createdAt: daysAgo(3), congregationId },
    })
    await tx.boardDocumentView.create({
      data: { documentId: doc.id, userId: accounts.alice, viewedAt: daysAgo(1), congregationId },
    })
    await tx.boardDocumentView.create({
      data: { documentId: doc.id, userId: accounts.bob, viewedAt: daysAgo(10), congregationId },
    })
    // Carol cannot see the board: her read, whatever its origin, is not counted.
    await tx.boardDocumentView.create({
      data: { documentId: doc.id, userId: accounts.carol, viewedAt: daysAgo(1), congregationId },
    })
  })
})

afterAll(async () => {
  if (!congregationId) return
  await withScope(congregationId, async tx => {
    await tx.boardDocumentView.deleteMany({})
    await tx.boardDocumentVersion.deleteMany({})
    await tx.boardDocument.deleteMany({})
    await tx.boardSectionVisibilityRole.deleteMany({})
    await tx.boardSection.deleteMany({})
    await tx.userRoleAssignment.deleteMany({})
    await tx.memberRoleAssignment.deleteMany({})
    await tx.userAccount.deleteMany({})
    await tx.member.deleteMany({})
    await tx.rolePermission.deleteMany({})
    await tx.role.deleteMany({})
  })
  await testDb.congregation.deleteMany({ where: { id: congregationId } })
  await testDb.$disconnect()
})

const readers = () => withScope(congregationId, tx => listBoardReaders(tx as never, congregationId))
const names = (list: { firstname: string | null }[]) => list.map(r => r.firstname).sort()

describe('listBoardReaders', () => {
  it('counts the active accounts that may read the board, through their roles or their member’s', async () => {
    expect(names(await readers())).toEqual(['Alice', 'Bob', 'Dave'])
  })
})

describe('sectionAudience', () => {
  it('keeps everyone for an open section', async () => {
    expect(names(sectionAudience(await readers(), []))).toEqual(['Alice', 'Bob', 'Dave'])
  })

  it('keeps only the holders of its roles for a restricted section, admins included in that rule', async () => {
    expect(names(sectionAudience(await readers(), [roles.elders]))).toEqual(['Bob'])
  })
})

describe('documentReads', () => {
  it('splits the audience into who read the current file and who did not, an older read said as such', async () => {
    const reads = await withScope(congregationId, tx =>
      documentReads(tx as never, { kind: 'pdf', id: openDocId, congregationId, now }),
    )

    expect(reads?.title).toBe('Rotation')
    expect(names(reads?.read ?? [])).toEqual(['Alice'])
    expect(reads?.unread.map(r => [r.firstname, r.outdated]).sort()).toEqual([
      ['Bob', true],
      ['Dave', false],
    ])
  })

  it('finds nothing for a document that is not this congregation’s', async () => {
    const reads = await withScope(congregationId, tx =>
      documentReads(tx as never, { kind: 'pdf', id: -1, congregationId, now }),
    )
    expect(reads).toBeNull()
  })
})
