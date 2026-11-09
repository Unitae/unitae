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

const { listBoardManagement } = await import('./board-management.queries')

const ts = Date.now()
const now = new Date('2026-11-08T12:00:00Z')
const days = (d: number) => new Date(now.getTime() + d * 86_400_000)

let congregationId: number
let uploaderId: number

beforeAll(async () => {
  const congregation = await testDb.congregation.create({
    data: { name: `Board Management ${ts}`, slug: `board-management-${ts}`, active: true },
  })
  congregationId = congregation.id
  const viewBoard = (
    await testDb.permission.upsert({
      where: { key: Permission.CanViewBoard },
      update: {},
      create: { key: Permission.CanViewBoard },
    })
  ).id

  await withScope(congregationId, async tx => {
    const viewer = await tx.role.create({ data: { key: `viewer-${ts}`, isBuiltIn: false, congregationId } })
    const elders = await tx.role.create({
      data: { key: `elders-${ts}`, name: 'Anciens', isBuiltIn: false, congregationId },
    })
    for (const role of [viewer, elders]) {
      await tx.rolePermission.create({ data: { roleId: role.id, permissionId: viewBoard, congregationId } })
    }
    const account = (key: string) =>
      tx.userAccount.create({
        data: { email: `${key}-${ts}@management.test`, password: 'x', firstname: key, active: true, congregationId },
      })
    const [ana, ben, eli] = await Promise.all([account('ana'), account('ben'), account('eli')])
    uploaderId = ana.id
    await tx.userRoleAssignment.create({ data: { userId: ana.id, roleId: viewer.id, congregationId } })
    await tx.userRoleAssignment.create({ data: { userId: ben.id, roleId: viewer.id, congregationId } })
    await tx.userRoleAssignment.create({ data: { userId: eli.id, roleId: elders.id, congregationId } })

    const open = await tx.boardSection.create({ data: { name: 'Assemblée', order: 1, congregationId } })
    const restricted = await tx.boardSection.create({ data: { name: 'Anciens', order: 2, congregationId } })
    await tx.boardSectionVisibilityRole.create({
      data: { sectionId: restricted.id, roleId: elders.id, congregationId },
    })

    const pdf = (title: string, order: number, sectionId: number, window: { from: Date | null; until?: Date }) =>
      tx.boardDocument.create({
        data: {
          title,
          order,
          sectionId,
          createdAt: days(-20),
          visibleFrom: window.from,
          visibleUntil: window.until ?? null,
          congregationId,
        },
      })
    const shown = await pdf('Rotation', 1, open.id, { from: days(-10), until: days(12) })
    await tx.boardDocumentVersion.create({
      data: {
        documentId: shown.id,
        uri: 'v1',
        versionNumber: 1,
        createdAt: shown.createdAt,
        uploadedById: ana.id,
        congregationId,
      },
    })
    await tx.boardDocumentView.create({
      data: { documentId: shown.id, userId: ana.id, viewedAt: days(-1), congregationId },
    })
    await pdf('Lettre', 0, open.id, { from: days(3) })
    await pdf('Comptes', 2, open.id, { from: days(-40), until: days(-2) })
    const draft = await pdf('Consignes', 0, restricted.id, { from: null })
    await tx.boardDocumentView.create({
      data: { documentId: draft.id, userId: eli.id, viewedAt: days(-1), congregationId },
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
    await tx.userAccount.deleteMany({})
    await tx.rolePermission.deleteMany({})
    await tx.role.deleteMany({})
  })
  await testDb.congregation.deleteMany({ where: { id: congregationId } })
  await testDb.$disconnect()
})

const manage = () =>
  withScope(congregationId, tx => listBoardManagement(tx as never, { congregationId, userId: uploaderId, now }))

describe('listBoardManagement', () => {
  it('lists every section and every document in order, whatever its state', async () => {
    const { sections } = await manage()

    expect(sections.map(s => [s.name, s.items.map(i => [i.title, i.state.kind])])).toEqual([
      [
        'Assemblée',
        [
          ['Lettre', 'scheduled'],
          ['Rotation', 'shown'],
          ['Comptes', 'expired'],
        ],
      ],
      ['Anciens', [['Consignes', 'unpublished']]],
    ])
  })

  it('counts reads among the people who can see each section, and names who a restricted one is for', async () => {
    const { sections } = await manage()
    const [open, restricted] = sections

    expect(open.roles).toEqual([])
    expect(open.items.find(i => i.title === 'Rotation')).toMatchObject({ read: 1, audience: 3 })
    expect(restricted.roles.map(r => r.label)).toEqual(['Anciens'])
    expect(restricted.items[0]).toMatchObject({ read: 1, audience: 1 })
  })

  it('tells which PDFs this person uploaded', async () => {
    const [open] = (await manage()).sections

    expect(open.items.find(i => i.title === 'Rotation')?.ownedByUser).toBe(true)
    expect(open.items.find(i => i.title === 'Lettre')?.ownedByUser).toBe(false)
  })
})
