import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import {
  findGroupLeaderCandidates,
  findGroupMemberCandidates,
  getGroup,
  getGroups,
  listGroupMembers,
  listGroups,
} from './groups.server'

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
let congAId: number
let congBId: number
let groupAId: number
let groupBId: number

// The moment getGroup reads the reports as of: its window runs from December 2025 to May 2026, so
// the May report below always falls in it.
const AS_OF = { timezone: 'Europe/Paris', now: new Date('2026-06-15T10:00:00Z') }
const MAY = { month: 4, year: 2026 }

// The member fields getGroup reads to compute its labels and must never return.
const RAW_MEMBER_FIELDS =
  /inactiveAt|baptismDate|createdAt|dpaCardUpToDate|survivalBackpackReady|isAnointed|hours|notes/

beforeAll(async () => {
  const [congA, congB] = await Promise.all([
    testDb.congregation.create({ data: { name: `Groups A ${ts}`, slug: `groups-a-${ts}`, active: true } }),
    testDb.congregation.create({ data: { name: `Groups B ${ts}`, slug: `groups-b-${ts}`, active: true } }),
  ])
  congAId = congA.id
  congBId = congB.id

  await withScope(congAId, async tx => {
    const responsible = await tx.member.create({
      data: { firstname: 'Resp', lastname: `A ${ts}`, isPublisher: true, congregationId: congAId },
    })
    const g = await tx.publisherGroup.create({
      data: { name: 'A-Group', adress: '', responsibleId: responsible.id, congregationId: congAId },
    })
    groupAId = g.id

    // An elder in the group with every kind of data the group pages must not hand to the browser:
    // personal dates, the medical-directive and backpack flags, contact details, and a report.
    const sensitive = await tx.member.create({
      data: {
        firstname: 'Sensitive',
        lastname: `A ${ts}`,
        isPublisher: true,
        isMale: true,
        isHelder: true,
        isAnointed: true,
        birthDate: new Date('1980-02-03'),
        baptismDate: new Date('1999-04-05'),
        phone: '0600000000',
        address: '1 rue Privée',
        email: 'sensitive@example.test',
        dpaCardUpToDate: true,
        survivalBackpackReady: true,
        publisherGroupId: g.id,
        congregationId: congAId,
      },
    })
    // Inactive: still in the group, but left off the board's field service groups document.
    await tx.member.create({
      data: {
        firstname: 'Inactive',
        lastname: `A ${ts}`,
        isPublisher: true,
        inactiveAt: new Date('2026-01-15'),
        publisherGroupId: g.id,
        congregationId: congAId,
      },
    })
    await tx.publisherActivity.create({
      data: {
        publisherId: sensitive.id,
        month: MAY.month,
        year: MAY.year,
        isPublisher: true,
        hours: 12,
        studies: 2,
        notes: 'private note',
        congregationId: congAId,
      },
    })
  })

  await withScope(congBId, async tx => {
    const responsible = await tx.member.create({
      data: { firstname: 'Resp', lastname: `B ${ts}`, isPublisher: true, congregationId: congBId },
    })
    const g = await tx.publisherGroup.create({
      data: { name: 'B-Group', adress: '', responsibleId: responsible.id, congregationId: congBId },
    })
    groupBId = g.id
  })
})

afterAll(async () => {
  await testDb.publisherActivity.deleteMany({ where: { congregationId: { in: [congAId, congBId] } } })
  await testDb.publisherGroup.deleteMany({ where: { congregationId: { in: [congAId, congBId] } } })
  await testDb.member.deleteMany({ where: { congregationId: { in: [congAId, congBId] } } })
  await testDb.congregation.deleteMany({ where: { id: { in: [congAId, congBId] } } })
  await testDb.$disconnect()
})

describe('getGroups (integration)', () => {
  it('returns only the current congregation groups under RLS scoping', async () => {
    const [aGroups, bGroups] = await Promise.all([
      withScope(congAId, tx => getGroups(tx, congAId)),
      withScope(congBId, tx => getGroups(tx, congBId)),
    ])

    expect(aGroups.map(g => g.id)).toEqual([groupAId])
    expect(bGroups.map(g => g.id)).toEqual([groupBId])
  })

  it('returns nothing when the congregationId filter targets another tenant, even inside its own scope', async () => {
    const rows = await withScope(congAId, tx => getGroups(tx, congBId))
    expect(rows).toEqual([])
  })
})

describe('getGroup (integration)', () => {
  it('returns the group when queried inside its congregation scope', async () => {
    const group = await withScope(congAId, tx => getGroup(tx, groupAId, congAId, AS_OF))
    expect(group?.id).toBe(groupAId)
    expect(group?.name).toBe('A-Group')
  })

  it('returns null when the group belongs to another congregation (RLS hides it)', async () => {
    const group = await withScope(congAId, tx => getGroup(tx, groupBId, congBId, AS_OF))
    expect(group).toBeNull()
  })

  // Regression: whole Member and PublisherActivity rows went to the browser, so anyone who could
  // open the page received birth dates, emergency flags and every member's hours.
  it('returns only what the page displays about each person', async () => {
    const group = await withScope(congAId, tx => getGroup(tx, groupAId, congAId, AS_OF))
    const member = group?.members.find(each => each.firstname === 'Sensitive')

    expect(Object.keys(group?.responsible ?? {}).sort()).toEqual(['firstname', 'id', 'lastname'])
    expect(Object.keys(member ?? {}).sort()).toEqual([
      'email',
      'emergencyGaps',
      'firstname',
      'id',
      'lastname',
      'reports',
      'signals',
    ])
    // The dates and flags the labels are computed from stay on the server.
    expect(JSON.stringify(group)).not.toMatch(RAW_MEMBER_FIELDS)
  })

  // Reported in May only, and added after the window (the test creates it today): the other months
  // expected no report.
  it("reads each month of the window as the publisher's report status", async () => {
    const group = await withScope(congAId, tx => getGroup(tx, groupAId, congAId, AS_OF))
    const member = group?.members.find(each => each.firstname === 'Sensitive')

    expect(group?.reportWindow.at(-1)).toEqual(MAY)
    expect(member?.reports.map(report => report.status)).toEqual([
      'not-expected',
      'not-expected',
      'not-expected',
      'not-expected',
      'not-expected',
      'filed',
    ])
    expect(member?.reports.at(-1)).toEqual({ ...MAY, status: 'filed', id: expect.any(Number) })
    expect(member?.emergencyGaps).toEqual(['contact'])
  })

  it('says since when an inactive publisher is inactive', async () => {
    const group = await withScope(congAId, tx => getGroup(tx, groupAId, congAId, AS_OF))

    expect(group?.inactiveMembers[0].signals).toEqual([{ kind: 'inactive', since: { month: 0, year: 2026 } }])
  })

  // The board's field service groups document leaves inactive publishers out: the group page lists
  // them apart, so whoever reads it can tell who the board does not show.
  it('lists the inactive publishers apart from the others, with the same fields', async () => {
    const group = await withScope(congAId, tx => getGroup(tx, groupAId, congAId, AS_OF))

    expect(group?.members.map(each => each.firstname)).toEqual(['Sensitive'])
    expect(group?.inactiveMembers.map(each => each.firstname)).toEqual(['Inactive'])
    expect(Object.keys(group?.inactiveMembers[0] ?? {}).sort()).toEqual(Object.keys(group?.members[0] ?? {}).sort())
  })
})

describe('listGroups (integration)', () => {
  it("returns each group's leaders by name only, with its publisher count", async () => {
    const [group] = await withScope(congAId, tx => listGroups(tx, congAId))

    expect(Object.keys(group).sort()).toEqual(['address', 'deputy', 'id', 'name', 'publisherCount', 'responsible'])
    expect(Object.keys(group.responsible).sort()).toEqual(['firstname', 'id', 'lastname'])
    expect(group.publisherCount).toBe(2)
  })
})

describe('findGroupLeaderCandidates (integration)', () => {
  it('returns the eligible brothers by name, with the group each already leads', async () => {
    const candidates = await withScope(congAId, tx => findGroupLeaderCandidates(tx, congAId))

    expect(candidates.map(each => each.firstname)).toEqual(['Sensitive'])
    expect(Object.keys(candidates[0]).sort()).toEqual(['deputyFor', 'firstname', 'id', 'lastname', 'responsibleFor'])
  })
})

describe('group membership queries (integration)', () => {
  it("lists the group's publishers by name", async () => {
    const members = await withScope(congAId, tx => listGroupMembers(tx, groupAId, congAId))

    expect(members.map(each => each.firstname)).toEqual(['Inactive', 'Sensitive'])
    expect(Object.keys(members[0]).sort()).toEqual(['firstname', 'id', 'lastname'])
  })

  // The overseer was created in no group: a NOT on the group id would drop him, as SQL's NOT
  // never matches a null.
  it('offers the publishers outside the group, those in no group included', async () => {
    const candidates = await withScope(congAId, tx => findGroupMemberCandidates(tx, congAId, groupAId))

    expect(candidates.map(each => each.firstname)).toEqual(['Resp'])
    expect(Object.keys(candidates[0]).sort()).toEqual(['deputyFor', 'firstname', 'id', 'lastname', 'responsibleFor'])
  })
})
