import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

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
let congregationId: number
let aliceId: number
let aliceAccountId: number
let bobId: number
let bobAccountId: number
let pastEventId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Dashboard Test ${ts}`, slug: `dashboard-test-${ts}`, active: true },
  })
  congregationId = cong.id

  await withScope(congregationId, async tx => {
    const aliceMember = await tx.member.create({
      data: {
        firstname: 'Alice',
        lastname: 'Dupont',
        isPublisher: true,
        congregationId,
      },
    })
    const aliceAccount = await tx.userAccount.create({
      data: {
        email: `alice-dash-${ts}@test.com`,
        password: 'hashed',
        active: true,
        memberId: aliceMember.id,
        congregationId,
      },
    })
    aliceId = aliceMember.id
    aliceAccountId = aliceAccount.id

    const bobMember = await tx.member.create({
      data: {
        firstname: 'Bob',
        lastname: 'Martin',
        isPublisher: true,
        congregationId,
      },
    })
    const bobAccount = await tx.userAccount.create({
      data: {
        email: `bob-dash-${ts}@test.com`,
        password: 'hashed',
        active: true,
        memberId: bobMember.id,
        congregationId,
      },
    })
    bobId = bobMember.id
    bobAccountId = bobAccount.id

    // Territory with attribution to Alice
    const territory = await tx.territory.create({
      data: { number: `T-DASH-${ts}`, type: TerritoryKind.Classical, congregationId },
    })

    await tx.attribution.create({
      data: {
        publisherId: aliceId,
        territoryId: territory.id,
        startDate: new Date('2026-01-01'),
        lateDate: new Date('2026-03-01'), // overdue
        congregationId,
      },
    })

    await tx.attribution.create({
      data: {
        publisherId: aliceId,
        territoryId: territory.id,
        startDate: new Date('2026-01-01'),
        lateDate: new Date('2026-03-01'),
        endDate: new Date('2026-02-15'), // completed, should not appear
        congregationId,
      },
    })

    // Board documents
    const section = await tx.boardSection.create({
      data: { name: `Section ${ts}`, order: 0, congregationId },
    })

    await tx.boardDocument.create({
      data: {
        title: `Unread PDF ${ts}`,
        sectionId: section.id,
        visibleFrom: new Date('2026-01-01'),
        visibleUntil: null,
        congregationId,
      },
    })

    const readDoc = await tx.boardDocument.create({
      data: {
        title: `Read PDF ${ts}`,
        sectionId: section.id,
        visibleFrom: new Date('2026-01-01'),
        visibleUntil: null,
        congregationId,
      },
    })

    // Mark doc as read by Alice
    await tx.boardDocument.update({
      where: {
        id_congregationId: { id: readDoc.id, congregationId },
      },
      data: { viewedBy: { connect: { id: aliceAccountId } } },
    })

    // Future event with programme assignments
    const eventKind = await tx.eventTemplate.create({
      data: { name: 'Midweek', key: `midweek-${ts}`, color: '#00aa00', congregationId },
    })

    const futureEvent = await tx.event.create({
      data: {
        name: `Future Meeting ${ts}`,
        templateId: eventKind.id,
        startDate: new Date('2027-06-01T19:00:00Z'),
        endDate: new Date('2027-06-01T21:00:00Z'),
        createdById: aliceAccountId,
        congregationId,
        status: 'released',
      },
    })

    await tx.eventPart.create({
      data: {
        eventId: futureEvent.id,
        assigneeId: aliceId,
        assistantId: bobId,
        name: 'Talk',
        section: 'main',
        order: 1,
        topic: 'Love',
        congregationId,
      },
    })

    await tx.eventPart.create({
      data: {
        eventId: futureEvent.id,
        assigneeId: bobId,
        name: 'Reading',
        section: 'main',
        order: 2,
        congregationId,
      },
    })

    await tx.eventServiceRole.create({
      data: {
        eventId: futureEvent.id,
        assigneeId: bobId,
        name: 'Sound',
        congregationId,
      },
    })

    // Past event (should not appear in getNextMeeting)
    const past = await tx.event.create({
      data: {
        name: `Past Meeting ${ts}`,
        startDate: new Date('2025-01-01T19:00:00Z'),
        endDate: new Date('2025-01-01T21:00:00Z'),
        createdById: aliceAccountId,
        congregationId,
        status: 'released',
      },
    })
    pastEventId = past.id
  })
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    await tx.eventServiceRole.deleteMany({ where: { congregationId } })
    await tx.eventPart.deleteMany({ where: { congregationId } })
    await tx.event.deleteMany({ where: { congregationId } })
    await tx.eventTemplate.deleteMany({ where: { congregationId } })
    await tx.boardDocument.deleteMany({ where: { congregationId } })
    await tx.boardSection.deleteMany({ where: { congregationId } })
    await tx.attribution.deleteMany({ where: { congregationId } })
    await tx.territory.deleteMany({ where: { congregationId } })
    await tx.userAccount.deleteMany({ where: { congregationId } })
    await tx.member.deleteMany({ where: { congregationId } })
  })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

// --- Import the module under test ---

const { getUserTerritories, getRecentDocuments, getUnreadDocumentCount, getNextMeeting, getConflictingAssignments } =
  await import('./dashboard.server')
const { getResponsibleConflicts } = await import('./get-responsible-conflicts.server')
const { refreshConflictFlags } = await import('~/features/events/server/programme-assignments.server')

// --- Tests ---

describe('getUserTerritories (integration)', () => {
  it('returns only active attributions for the user', async () => {
    const result = await withScope(congregationId, tx => getUserTerritories(tx, aliceId))
    // Only the attribution without endDate should appear
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('overdue')
  })

  it('returns empty array for user with no attributions', async () => {
    const result = await withScope(congregationId, tx => getUserTerritories(tx, bobId))
    expect(result).toEqual([])
  })
})

describe('getUnreadDocumentCount (integration)', () => {
  it('counts only unread visible documents for the user', async () => {
    const result = await withScope(congregationId, tx => getUnreadDocumentCount(tx, aliceAccountId, congregationId))
    // 1 unread PDF (the other was marked as read)
    expect(result).toBe(1)
  })

  it('counts all documents as unread for a user who read nothing', async () => {
    const result = await withScope(congregationId, tx => getUnreadDocumentCount(tx, bobAccountId, congregationId))
    // Bob has read nothing — both PDFs are unread
    expect(result).toBe(2)
  })
})

describe('getRecentDocuments (integration)', () => {
  it('returns documents with correct alreadyViewed flag', async () => {
    const result = await withScope(congregationId, tx => getRecentDocuments(tx, aliceAccountId, congregationId))
    expect(result.length).toBeGreaterThanOrEqual(1)
    const readDoc = result.find(d => d.title.includes('Read PDF'))
    const unreadDoc = result.find(d => d.title.includes('Unread PDF'))
    expect(readDoc?.alreadyViewed).toBe(true)
    expect(unreadDoc?.alreadyViewed).toBe(false)
  })
})

describe('getNextMeeting (integration)', () => {
  it('returns the next future event with programme data', async () => {
    const result = await withScope(congregationId, tx => getNextMeeting(tx, aliceId))
    expect(result).not.toBeNull()
    expect(result?.name).toContain('Future Meeting')
    expect(result?.parts.length).toBeGreaterThanOrEqual(2)
    expect(result?.serviceRoles.length).toBeGreaterThanOrEqual(1)
  })

  it('identifies parts assigned to the user (as assignee)', async () => {
    const result = await withScope(congregationId, tx => getNextMeeting(tx, aliceId))
    expect(result?.userPartIds).toHaveLength(1)
    const userPart = result?.parts.find(p => result.userPartIds.includes(p.id))
    expect(userPart?.name).toBe('Talk')
  })

  it('identifies parts assigned to the user (as assistant)', async () => {
    const result = await withScope(congregationId, tx => getNextMeeting(tx, bobId))
    // Bob is assistant on Talk and assignee on Reading
    expect(result?.userPartIds).toHaveLength(2)
    expect(result?.userServiceRoleIds).toHaveLength(1)
  })

  it('does not return past events', async () => {
    const result = await withScope(congregationId, tx => getNextMeeting(tx, aliceId))
    expect(result?.id).not.toBe(pastEventId)
  })

  it("ignores another user's day off when picking the next meeting", async () => {
    const offEventId = await withScope(congregationId, async tx => {
      const offKind = await tx.eventTemplate.create({
        data: { name: 'Absence', key: 'day-off', color: '#888888', congregationId },
      })
      const off = await tx.event.create({
        data: {
          name: 'Absence',
          templateId: offKind.id,
          startDate: new Date('2027-05-01T00:00:00Z'),
          endDate: new Date('2027-05-03T00:00:00Z'),
          createdById: bobAccountId,
          congregationId,
          status: 'released',
        },
      })
      return off.id
    })

    try {
      const result = await withScope(congregationId, tx => getNextMeeting(tx, aliceId))
      expect(result?.name).toBe(`Future Meeting ${ts}`)
    } finally {
      await withScope(congregationId, async tx => {
        await tx.event.delete({ where: { id_congregationId: { id: offEventId, congregationId } } })
        await tx.eventTemplate.deleteMany({ where: { key: 'day-off', congregationId } })
      })
    }
  })
})

describe('getConflictingAssignments (integration)', () => {
  type SeedOpts = {
    name: string
    startDate: Date
    endDate?: Date
    parts?: { assigneeId?: number | null; assistantId?: number | null; hasConflict?: boolean; name?: string }[]
    serviceRoles?: { assigneeId: number; hasConflict?: boolean; name?: string }[]
    cong?: number
    createdById?: number
  }

  function seedEvent(opts: SeedOpts) {
    const cong = opts.cong ?? congregationId
    return withScope(cong, async tx => {
      const eventKind = await tx.eventTemplate.findFirstOrThrow({
        where: { congregationId: cong, key: { not: 'day-off' } },
      })
      const event = await tx.event.create({
        data: {
          name: opts.name,
          templateId: eventKind.id,
          startDate: opts.startDate,
          endDate: opts.endDate ?? new Date(opts.startDate.getTime() + 2 * 60 * 60 * 1000),
          createdById: opts.createdById ?? aliceAccountId,
          congregationId: cong,
          // Every publisher-facing conflict / dashboard query filters on
          // status='released' now that the draft/released workflow is live.
          // Test fixtures are always public.
          status: 'released',
        },
      })
      const partIds = await Promise.all(
        (opts.parts ?? []).map(async (p, i) => {
          const created = await tx.eventPart.create({
            data: {
              eventId: event.id,
              assigneeId: p.assigneeId ?? null,
              assistantId: p.assistantId ?? null,
              name: p.name ?? `Part ${i}`,
              section: 'main',
              order: i,
              hasConflict: p.hasConflict ?? false,
              congregationId: cong,
            },
          })
          return created.id
        }),
      )
      const serviceRoleIds = await Promise.all(
        (opts.serviceRoles ?? []).map(async sr => {
          const created = await tx.eventServiceRole.create({
            data: {
              eventId: event.id,
              assigneeId: sr.assigneeId,
              name: sr.name ?? 'Service',
              hasConflict: sr.hasConflict ?? false,
              congregationId: cong,
            },
          })
          return created.id
        }),
      )
      return { eventId: event.id, partIds, serviceRoleIds }
    })
  }

  async function cleanupEvent(eventId: number, cong: number = congregationId) {
    await withScope(cong, async tx => {
      await tx.eventServiceRole.deleteMany({ where: { eventId, congregationId: cong } })
      await tx.eventPart.deleteMany({ where: { eventId, congregationId: cong } })
      await tx.event.delete({ where: { id_congregationId: { id: eventId, congregationId: cong } } })
    })
  }

  it('returns the conflict when the user is the part assignee', async () => {
    const seeded = await seedEvent({
      name: 'Assignee Conflict',
      startDate: new Date('2027-08-01T19:00:00Z'),
      parts: [{ assigneeId: aliceId, hasConflict: true, name: 'Discours' }],
    })
    try {
      const result = await withScope(congregationId, tx => getConflictingAssignments(tx, aliceId))
      expect(result).not.toBeNull()
      expect(result?.kind).toBe('part')
      expect(result?.id).toBe(seeded.partIds[0])
      expect(result?.name).toBe('Discours')
    } finally {
      await cleanupEvent(seeded.eventId)
    }
  })

  it('returns the conflict when the user is the part assistant (not assignee)', async () => {
    const seeded = await seedEvent({
      name: 'Assistant Conflict',
      startDate: new Date('2027-08-02T19:00:00Z'),
      parts: [{ assigneeId: bobId, assistantId: aliceId, hasConflict: true, name: 'Lecture' }],
    })
    try {
      const result = await withScope(congregationId, tx => getConflictingAssignments(tx, aliceId))
      expect(result?.kind).toBe('part')
      expect(result?.id).toBe(seeded.partIds[0])
    } finally {
      await cleanupEvent(seeded.eventId)
    }
  })

  it('returns the conflict for a service role with kind="service-role"', async () => {
    const seeded = await seedEvent({
      name: 'Service Role Conflict',
      startDate: new Date('2027-08-03T19:00:00Z'),
      serviceRoles: [{ assigneeId: aliceId, hasConflict: true, name: 'Son' }],
    })
    try {
      const result = await withScope(congregationId, tx => getConflictingAssignments(tx, aliceId))
      expect(result?.kind).toBe('service-role')
      expect(result?.id).toBe(seeded.serviceRoleIds[0])
      expect(result?.name).toBe('Son')
    } finally {
      await cleanupEvent(seeded.eventId)
    }
  })

  it('picks the earliest conflict when several exist across part and service role', async () => {
    const later = await seedEvent({
      name: 'Later Part',
      startDate: new Date('2027-09-15T19:00:00Z'),
      parts: [{ assigneeId: aliceId, hasConflict: true }],
    })
    const earlier = await seedEvent({
      name: 'Earlier Service Role',
      startDate: new Date('2027-09-01T19:00:00Z'),
      serviceRoles: [{ assigneeId: aliceId, hasConflict: true, name: 'Early Sound' }],
    })
    try {
      const result = await withScope(congregationId, tx => getConflictingAssignments(tx, aliceId))
      expect(result?.kind).toBe('service-role')
      expect(result?.name).toBe('Early Sound')
      expect(result?.id).toBe(earlier.serviceRoleIds[0])
    } finally {
      await cleanupEvent(earlier.eventId)
      await cleanupEvent(later.eventId)
    }
  })

  it('ignores assignments where hasConflict is false', async () => {
    const seeded = await seedEvent({
      name: 'No Conflict',
      startDate: new Date('2027-10-01T19:00:00Z'),
      parts: [{ assigneeId: aliceId, hasConflict: false }],
      serviceRoles: [{ assigneeId: aliceId, hasConflict: false }],
    })
    try {
      const result = await withScope(congregationId, tx => getConflictingAssignments(tx, aliceId))
      expect(result).toBeNull()
    } finally {
      await cleanupEvent(seeded.eventId)
    }
  })

  it('ignores conflicts on past events', async () => {
    const seeded = await seedEvent({
      name: 'Past Conflict',
      startDate: new Date('2024-01-01T19:00:00Z'),
      endDate: new Date('2024-01-01T21:00:00Z'),
      parts: [{ assigneeId: aliceId, hasConflict: true }],
    })
    try {
      const result = await withScope(congregationId, tx => getConflictingAssignments(tx, aliceId))
      expect(result).toBeNull()
    } finally {
      await cleanupEvent(seeded.eventId)
    }
  })

  it('does not leak conflicts across congregations (RLS)', async () => {
    const otherTs = Date.now()
    const otherCong = await testDb.congregation.create({
      data: { name: `Dashboard Test Other ${otherTs}`, slug: `dashboard-test-other-${otherTs}`, active: true },
    })

    const otherSeed = await withScope(otherCong.id, async tx => {
      const otherKind = await tx.eventTemplate.create({
        data: { name: 'Midweek', key: `midweek-other-${otherTs}`, color: '#00aa00', congregationId: otherCong.id },
      })
      const otherMember = await tx.member.create({
        data: { firstname: 'Eve', lastname: 'Cross', isPublisher: true, congregationId: otherCong.id },
      })
      const otherAccount = await tx.userAccount.create({
        data: {
          email: `eve-cross-${otherTs}@test.com`,
          password: 'hashed',
          active: true,
          memberId: otherMember.id,
          congregationId: otherCong.id,
        },
      })
      const event = await tx.event.create({
        data: {
          name: 'Other Cong Event',
          templateId: otherKind.id,
          startDate: new Date('2027-11-01T19:00:00Z'),
          endDate: new Date('2027-11-01T21:00:00Z'),
          createdById: otherAccount.id,
          congregationId: otherCong.id,
          status: 'released',
        },
      })
      // Same numeric id range as Alice — guarantees that without RLS the other-cong row would match
      const part = await tx.eventPart.create({
        data: {
          eventId: event.id,
          assigneeId: otherMember.id,
          name: 'Discours',
          section: 'main',
          order: 1,
          hasConflict: true,
          congregationId: otherCong.id,
        },
      })
      return {
        otherKindId: otherKind.id,
        otherMemberId: otherMember.id,
        otherAccountId: otherAccount.id,
        eventId: event.id,
        partId: part.id,
      }
    })

    try {
      // Query as Alice's member id, but scoped to the other congregation:
      // RLS must hide the other-cong row even if some member id happened to collide.
      const aliceFromOtherCong = await withScope(otherCong.id, tx => getConflictingAssignments(tx, aliceId))
      expect(aliceFromOtherCong).toBeNull()

      // And from Alice's own congregation, the other cong's row must also be invisible.
      const aliceFromHerCong = await withScope(congregationId, tx => getConflictingAssignments(tx, aliceId))
      expect(aliceFromHerCong).toBeNull()
    } finally {
      await withScope(otherCong.id, async tx => {
        await tx.eventPart.delete({
          where: { id_congregationId: { id: otherSeed.partId, congregationId: otherCong.id } },
        })
        await tx.event.delete({
          where: { id_congregationId: { id: otherSeed.eventId, congregationId: otherCong.id } },
        })
        await tx.userAccount.delete({ where: { id: otherSeed.otherAccountId } })
        await tx.member.delete({ where: { id: otherSeed.otherMemberId } })
        await tx.eventTemplate.delete({
          where: { id_congregationId: { id: otherSeed.otherKindId, congregationId: otherCong.id } },
        })
      })
      await testDb.congregation.delete({ where: { id: otherCong.id } })
    }
  })

  // Invariant pin: the dashboard alert is correct only as long as `refreshConflictFlags`
  // keeps the assignment-level `hasConflict` flag in sync with the actual day-off state.
  // We exercise the "no overlapping day-off → flag must clear" path end-to-end, which
  // catches future regressions where refreshConflictFlags forgets to recompute the flag
  // for templated events or stops touching one of the two assignment tables.
  it('refreshConflictFlags clears stale hasConflict and the alert disappears', async () => {
    const setup = await withScope(congregationId, async tx => {
      const template = await tx.eventTemplate.create({
        data: {
          name: 'Invariant Template',
          key: `invariant-template-${ts}`,
          congregationId,
        },
      })
      const event = await tx.event.create({
        data: {
          name: 'Invariant Event',
          templateId: template.id,
          startDate: new Date('2027-12-01T19:00:00Z'),
          endDate: new Date('2027-12-01T21:00:00Z'),
          createdById: aliceAccountId,
          congregationId,
          status: 'released',
        },
      })
      // Pre-set the flag to true to simulate a stale conflict left over from a now-deleted day-off.
      const part = await tx.eventPart.create({
        data: {
          eventId: event.id,
          assigneeId: aliceId,
          name: 'Discours',
          section: 'main',
          order: 1,
          hasConflict: true,
          congregationId,
        },
      })
      const serviceRole = await tx.eventServiceRole.create({
        data: {
          eventId: event.id,
          assigneeId: aliceId,
          name: 'Son',
          hasConflict: true,
          congregationId,
        },
      })
      return { templateId: template.id, eventId: event.id, partId: part.id, serviceRoleId: serviceRole.id }
    })

    try {
      const before = await withScope(congregationId, tx => getConflictingAssignments(tx, aliceId))
      expect(before?.id).toBe(setup.partId)

      await withScope(congregationId, tx =>
        refreshConflictFlags(
          tx,
          aliceId,
          new Date('2027-11-30T00:00:00Z'),
          new Date('2027-12-02T00:00:00Z'),
          congregationId,
        ),
      )

      const partFlag = await withScope(congregationId, tx =>
        tx.eventPart.findUniqueOrThrow({
          where: { id_congregationId: { id: setup.partId, congregationId } },
          select: { hasConflict: true },
        }),
      )
      const serviceFlag = await withScope(congregationId, tx =>
        tx.eventServiceRole.findUniqueOrThrow({
          where: { id_congregationId: { id: setup.serviceRoleId, congregationId } },
          select: { hasConflict: true },
        }),
      )
      expect(partFlag.hasConflict).toBe(false)
      expect(serviceFlag.hasConflict).toBe(false)

      const after = await withScope(congregationId, tx => getConflictingAssignments(tx, aliceId))
      expect(after).toBeNull()
    } finally {
      await withScope(congregationId, async tx => {
        await tx.eventServiceRole.delete({
          where: { id_congregationId: { id: setup.serviceRoleId, congregationId } },
        })
        await tx.eventPart.delete({
          where: { id_congregationId: { id: setup.partId, congregationId } },
        })
        await tx.event.delete({ where: { id_congregationId: { id: setup.eventId, congregationId } } })
        await tx.eventTemplate.delete({
          where: { id_congregationId: { id: setup.templateId, congregationId } },
        })
      })
    }
  })

  // Invariant pin (responsible side): `getResponsibleConflicts` derives its
  // result from the persisted `hasConflict` flag with no caching layer, so
  // once the flag flips to `false` the responsible's card must vanish on
  // the next read. Mirrors the absentee-side "refreshConflictFlags clears
  // stale hasConflict and the alert disappears" pin earlier in this file.
  it('getResponsibleConflicts drops the entry when hasConflict clears on the underlying assignment', async () => {
    const setup = await withScope(congregationId, async tx => {
      const template = await tx.eventTemplate.create({
        data: {
          name: 'Responsible Invariant Template',
          key: `resp-invariant-template-${ts}`,
          congregationId,
        },
      })
      // Bob is the responsible for this template; Alice is the absentee.
      await tx.templateResponsible.create({
        data: {
          templateId: template.id,
          userId: bobAccountId,
          congregationId,
        },
      })
      const event = await tx.event.create({
        data: {
          name: 'Responsible Invariant Event',
          templateId: template.id,
          startDate: new Date('2028-01-05T19:00:00Z'),
          endDate: new Date('2028-01-05T21:00:00Z'),
          createdById: aliceAccountId,
          congregationId,
          status: 'released',
        },
      })
      const part = await tx.eventPart.create({
        data: {
          eventId: event.id,
          assigneeId: aliceId,
          name: 'Discours',
          section: 'main',
          order: 1,
          hasConflict: true,
          congregationId,
        },
      })
      return { templateId: template.id, eventId: event.id, partId: part.id }
    })

    try {
      // Bob is the responsible; he sees the outstanding conflict on his template.
      const before = await withScope(congregationId, tx => getResponsibleConflicts(tx, bobAccountId, false))
      expect(before.count).toBe(1)
      expect(before.absenteeNames).toEqual(['Alice Dupont'])

      // Simulate resolution: the underlying assignment is no longer in conflict
      // (either the absence went away or the assignment was reassigned).
      await withScope(congregationId, tx =>
        tx.eventPart.update({
          where: { id_congregationId: { id: setup.partId, congregationId } },
          data: { hasConflict: false },
        }),
      )

      const after = await withScope(congregationId, tx => getResponsibleConflicts(tx, bobAccountId, false))
      expect(after).toEqual({ count: 0, absenteeNames: [], totalAbsenteesCount: 0 })
    } finally {
      await withScope(congregationId, async tx => {
        await tx.eventPart.delete({
          where: { id_congregationId: { id: setup.partId, congregationId } },
        })
        await tx.event.delete({ where: { id_congregationId: { id: setup.eventId, congregationId } } })
        await tx.templateResponsible.deleteMany({ where: { templateId: setup.templateId } })
        await tx.eventTemplate.delete({
          where: { id_congregationId: { id: setup.templateId, congregationId } },
        })
      })
    }
  })

  // A ProgramManager should see conflicts on events they don't own via a
  // template responsibility — including untemplated events, which have no
  // responsibles at all. This pins the "manager sees everything" branch of
  // the filter (the non-manager path is covered by unit tests).
  it('getResponsibleConflicts includes untemplated events for ProgramManager users', async () => {
    const setup = await withScope(congregationId, async tx => {
      const event = await tx.event.create({
        data: {
          name: 'Untemplated Manager Event',
          templateId: null,
          startDate: new Date('2028-02-10T19:00:00Z'),
          endDate: new Date('2028-02-10T21:00:00Z'),
          createdById: aliceAccountId,
          congregationId,
          status: 'released',
        },
      })
      const part = await tx.eventPart.create({
        data: {
          eventId: event.id,
          assigneeId: aliceId,
          name: 'Custom part',
          section: 'main',
          order: 1,
          hasConflict: true,
          congregationId,
        },
      })
      return { eventId: event.id, partId: part.id }
    })

    try {
      // Bob is neither a template responsible nor a manager — must see nothing.
      const nonManager = await withScope(congregationId, tx => getResponsibleConflicts(tx, bobAccountId, false))
      expect(nonManager.count).toBe(0)

      // ProgramManager path — same query, isProgramManager=true — must include it.
      const asManager = await withScope(congregationId, tx => getResponsibleConflicts(tx, bobAccountId, true))
      expect(asManager.count).toBe(1)
      expect(asManager.absenteeNames).toEqual(['Alice Dupont'])
    } finally {
      await withScope(congregationId, async tx => {
        await tx.eventPart.delete({
          where: { id_congregationId: { id: setup.partId, congregationId } },
        })
        await tx.event.delete({ where: { id_congregationId: { id: setup.eventId, congregationId } } })
      })
    }
  })
})
