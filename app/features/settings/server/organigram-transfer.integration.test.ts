import { PrismaPg } from '@prisma/adapter-pg'
import JsZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntityIdMap } from './data-transfer.type'

// The organigram must survive a backup. Two things make that harder than it looks:
//
//  - `parentRoleId` is a self-reference, so a role's parent is a *source* id that has to be
//    translated through the importer's id map. Sorting the archive by depth — the intuitive
//    fix — does not help, because the problem is translation rather than ordering.
//  - `UserRoleAssignment.kind` decides who leads a service. Losing it on restore silently
//    demotes every responsable to a plain member, which is a change in who may do what.
//
// Runs against DB_URL: this exercises export and import as the schema owner does.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

type Tx = Parameters<Parameters<typeof testDb.$transaction>[0]>[0]

/**
 * Local scope helper rather than the app's `withScope`, which connects as `unitae_app` via
 * DB_RUNTIME_URL; this file already holds an owner connection.
 *
 * Note the owner bypasses row-level security, so `SET LOCAL` does not actually filter here —
 * the archive comes back holding every congregation's rows. That is fine for this test, which
 * is about whether the columns survive the trip, and the fixture is isolated explicitly below
 * rather than by trusting a scope that is not in force.
 */
function withScope<T>(congregationId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return testDb.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}

const stamp = `orgxfer-${process.pid}-${Date.now()}`
let sourceId = 0
let targetId = 0

/** ids of the source roles, by key, so assertions can name what they mean. */
const sourceRoles = new Map<string, number>()

beforeAll(async () => {
  const [source, target] = await Promise.all([
    testDb.congregation.create({ data: { name: `${stamp}-src`, slug: `${stamp}-src`, active: true } }),
    testDb.congregation.create({ data: { name: `${stamp}-dst`, slug: `${stamp}-dst`, active: true } }),
  ])
  sourceId = source.id
  targetId = target.id

  // A three-level chart: comité → secrétaire → comptes, plus a detached service.
  const comite = await testDb.role.create({
    data: {
      key: 'comite',
      name: 'Comité de service',
      isBuiltIn: false,
      congregationId: sourceId,
      showInOrganigram: true,
      organigramOrder: 5,
    },
  })
  const secretaire = await testDb.role.create({
    data: {
      key: 'secretaire',
      name: 'Secrétaire',
      isBuiltIn: false,
      congregationId: sourceId,
      showInOrganigram: true,
      organigramOrder: 5,
      parentRoleId: comite.id,
      // A personal role: the flag must survive the round trip like the rest of the shape.
      isSinglePerson: true,
    },
  })
  const comptes = await testDb.role.create({
    data: {
      key: 'comptes',
      name: 'Comptes',
      isBuiltIn: false,
      congregationId: sourceId,
      showInOrganigram: true,
      organigramOrder: 10,
      organigramNote: 'Équipe des préposés',
      parentRoleId: secretaire.id,
    },
  })
  // Deliberately NOT in the chart: the flag must survive as false, not become true.
  const horsChart = await testDb.role.create({
    data: { key: 'hors-chart', name: 'Hors organigramme', isBuiltIn: false, congregationId: sourceId },
  })

  for (const [key, id] of [
    ['comite', comite.id],
    ['secretaire', secretaire.id],
    ['comptes', comptes.id],
    ['hors-chart', horsChart.id],
  ] as const) {
    sourceRoles.set(key, id)
  }

  // Two people in one node with different seats — the distinction that must not be lost.
  const member = await testDb.member.create({
    data: { firstname: 'Jean', lastname: 'Chef', congregationId: sourceId, isPublisher: true },
  })
  const deputy = await testDb.member.create({
    data: { firstname: 'Paul', lastname: 'Adjoint', congregationId: sourceId, isPublisher: true },
  })
  const leadAccount = await testDb.userAccount.create({
    data: { email: `${stamp}-lead@test.com`, password: 'x', congregationId: sourceId, memberId: member.id },
  })
  const deputyAccount = await testDb.userAccount.create({
    data: { email: `${stamp}-dep@test.com`, password: 'x', congregationId: sourceId, memberId: deputy.id },
  })
  await testDb.userRoleAssignment.createMany({
    data: [
      { userId: leadAccount.id, roleId: comptes.id, congregationId: sourceId, kind: 'leader' },
      { userId: deputyAccount.id, roleId: comptes.id, congregationId: sourceId, kind: 'deputy' },
    ],
  })
})

afterAll(async () => {
  for (const id of [sourceId, targetId]) {
    if (!id) continue
    await testDb.userRoleAssignment.deleteMany({ where: { congregationId: id } })
    await testDb.userAccount.deleteMany({ where: { congregationId: id } })
    await testDb.member.deleteMany({ where: { congregationId: id } })
    await testDb.rolePermission.deleteMany({ where: { congregationId: id } })
    // Children first: the self-referencing FK is ON DELETE RESTRICT.
    await testDb.role.updateMany({ where: { congregationId: id }, data: { parentRoleId: null } })
    await testDb.role.deleteMany({ where: { congregationId: id } })
    await testDb.congregation.delete({ where: { id } }).catch(() => undefined)
  }
  await testDb.$disconnect()
})

/** Export just the two files this test cares about, exactly as the exporter writes them. */
async function exportRolesAndSeats(): Promise<JsZip> {
  const mod = await import('./export-congregation.server')
  const zip = new JsZip()

  // The export steps carry no congregation filter of their own — row-level security supplies
  // it — so they have to run inside the source scope exactly as the real exporter does.
  await withScope(sourceId, async db => {
    const steps = mod.buildExportSteps(db as never, sourceId, {} as never)
    for (const name of ['roles', 'user-role-assignments'] as const) {
      const step = steps.find(candidate => candidate.name === name)
      expect(step, `export step "${name}" is missing`).toBeDefined()
      const all = (await step?.export()) as Record<string, unknown>[]
      const fixtureRoleIds = new Set(sourceRoles.values())
      const rows =
        name === 'roles'
          ? all.filter(row => fixtureRoleIds.has(row.id as number))
          : all.filter(row => fixtureRoleIds.has(row.roleId as number))
      zip.file(`data/${name}.ndjson`, rows.map(row => JSON.stringify(row)).join('\n'))
    }
  })
  return zip
}

describe('organigram survives an export/import round trip', () => {
  it('carries the tree columns and the seat kind through the archive', async () => {
    const zip = await exportRolesAndSeats()

    const rolesLine = await zip.file('data/roles.ndjson')?.async('string')
    const roles = (rolesLine ?? '')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as Record<string, unknown>)

    const comptes = roles.find(role => role.key === 'comptes')
    expect(comptes, 'comptes is missing from the export').toBeDefined()
    expect(comptes?.showInOrganigram).toBe(true)
    expect(comptes?.parentRoleId).toBe(sourceRoles.get('secretaire'))
    expect(comptes?.organigramOrder).toBe(10)
    expect(comptes?.organigramNote).toBe('Équipe des préposés')
    expect(comptes?.isSinglePerson).toBe(false)

    const seatsLine = await zip.file('data/user-role-assignments.ndjson')?.async('string')
    const seats = (seatsLine ?? '')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as Record<string, unknown>)
    expect(seats.map(seat => seat.kind).sort()).toEqual(['deputy', 'leader'])
  })

  it('rebuilds the tree in the target congregation with translated ids', async () => {
    const mod = await import('./import-congregation.server')
    const zip = await exportRolesAndSeats()
    // The members and accounts the seats point at travel in their own files; this test is about
    // the tree, so import roles only and assert the structure.
    const idMap = new EntityIdMap()

    await withScope(targetId, db => mod.importRoles(zip, db as never, idMap, targetId))

    const imported = await testDb.role.findMany({
      where: { congregationId: targetId },
      select: {
        key: true,
        id: true,
        parentRoleId: true,
        showInOrganigram: true,
        organigramOrder: true,
        isSinglePerson: true,
      },
    })
    const byKey = new Map(imported.map(role => [role.key, role]))
    expect([...byKey.keys()].sort()).toEqual(['comite', 'comptes', 'hors-chart', 'secretaire'])

    // The parent must be the *target* row, not the source id that was written in the archive.
    expect(byKey.get('secretaire')?.id).toBeGreaterThan(0)
    expect(byKey.get('comptes')?.parentRoleId).toBe(byKey.get('secretaire')?.id)
    expect(byKey.get('secretaire')?.parentRoleId).toBe(byKey.get('comite')?.id)
    expect(byKey.get('comite')?.parentRoleId).toBeNull()

    expect(byKey.get('comptes')?.showInOrganigram).toBe(true)
    expect(byKey.get('comptes')?.organigramOrder).toBe(10)
    // A role that was not in the chart must not arrive in it.
    expect(byKey.get('hors-chart')?.showInOrganigram).toBe(false)

    // A personal role arrives personal; a group arrives a group.
    expect(byKey.get('secretaire')?.isSinglePerson).toBe(true)
    expect(byKey.get('comptes')?.isSinglePerson).toBe(false)
  })
})
