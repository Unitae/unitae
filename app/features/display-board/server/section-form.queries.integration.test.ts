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

const { loadSectionForm } = await import('./section-form.queries')

const ts = Date.now()
const ids = { cong: 0, other: 0, viewer: 0, elders: 0, ana: 0, section: 0, otherSection: 0 }

beforeAll(async () => {
  ids.cong = (
    await testDb.congregation.create({ data: { name: `Section Form ${ts}`, slug: `section-form-${ts}`, active: true } })
  ).id
  ids.other = (
    await testDb.congregation.create({
      data: { name: `Section Form other ${ts}`, slug: `section-form-other-${ts}`, active: true },
    })
  ).id
  const viewBoard = (
    await testDb.permission.upsert({
      where: { key: Permission.CanViewBoard },
      update: {},
      create: { key: Permission.CanViewBoard },
    })
  ).id
  await withScope(ids.cong, async tx => {
    const viewer = await tx.role.create({ data: { key: `viewer-${ts}`, isBuiltIn: false, congregationId: ids.cong } })
    const elders = await tx.role.create({
      data: { key: `elders-${ts}`, name: 'Anciens', isBuiltIn: false, congregationId: ids.cong },
    })
    ids.viewer = viewer.id
    ids.elders = elders.id
    for (const role of [viewer, elders]) {
      await tx.rolePermission.create({ data: { roleId: role.id, permissionId: viewBoard, congregationId: ids.cong } })
    }
    const account = (key: string) =>
      tx.userAccount.create({
        data: { email: `${key}-${ts}@section-form.test`, password: 'x', active: true, congregationId: ids.cong },
      })
    const ana = await account('ana')
    const ben = await account('ben')
    ids.ana = ana.id
    await tx.userRoleAssignment.create({ data: { userId: ana.id, roleId: viewer.id, congregationId: ids.cong } })
    await tx.userRoleAssignment.create({ data: { userId: ben.id, roleId: elders.id, congregationId: ids.cong } })
    const section = await tx.boardSection.create({ data: { name: 'Anciens', order: 0, congregationId: ids.cong } })
    ids.section = section.id
    await tx.boardSectionVisibilityRole.create({
      data: { sectionId: section.id, roleId: elders.id, congregationId: ids.cong },
    })
  })
  ids.otherSection = await withScope(ids.other, async tx => {
    const section = await tx.boardSection.create({ data: { name: 'Ailleurs', order: 0, congregationId: ids.other } })
    return section.id
  })
})

afterAll(async () => {
  for (const id of [ids.cong, ids.other]) {
    if (!id) continue
    await withScope(id, async tx => {
      await tx.boardSectionVisibilityRole.deleteMany({})
      await tx.boardSection.deleteMany({})
      await tx.userRoleAssignment.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.rolePermission.deleteMany({})
      await tx.role.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [ids.cong, ids.other] } } })
  await testDb.$disconnect()
})

const load = (sectionId: number | null) =>
  withScope(ids.cong, tx => loadSectionForm(tx as never, { congregationId: ids.cong, userId: ids.ana, sectionId }))

describe('loadSectionForm', () => {
  it('gives the roles to choose from, the roles of each person who can open the board, and mine', async () => {
    const form = await load(null)

    expect(form?.roles.map(r => r.id)).toEqual(expect.arrayContaining([ids.viewer, ids.elders]))
    expect(form?.readerRoles).toHaveLength(2)
    expect(form?.readerRoles).toEqual(expect.arrayContaining([[ids.viewer], [ids.elders]]))
    expect(form?.viewerRoleIds).toEqual([ids.viewer])
    expect(form?.section).toBeNull()
  })

  it('gives a section with the roles that can see it', async () => {
    const form = await load(ids.section)

    expect(form?.section).toEqual({ id: ids.section, name: 'Anciens', roleIds: [ids.elders] })
  })

  it("finds nothing for another congregation's section", async () => {
    expect(await load(ids.otherSection)).toBeNull()
  })
})
