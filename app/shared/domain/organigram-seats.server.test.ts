import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoleStore } from '~/tests/helpers/role-store'

const syncServiceCommitteeMembers = vi.fn()
vi.mock('~/shared/domain/service-committee.server', () => ({ syncServiceCommitteeMembers }))

vi.mock('~/shared/auth/permissions.server', () => ({
  isAccountAdmin: vi.fn(async () => false),
  requireNotLastAdmin: vi.fn(),
}))

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { OrganigramChanged: 'OrganigramChanged', UserRoleAssignmentChanged: 'UserRoleAssignmentChanged' },
  audit: vi.fn(),
}))

const { seatMember, unseatMember } = await import('./organigram-seats.server')
const { ForbiddenError, ValidationError } = await import('~/shared/errors/app-error.server')

// The actor's permissions: an admin, so grant limits never interfere with what these tests cover.
const ADMIN_ACTOR = new Set(['can-do-anything'])
const CONGREGATION = 10
const ACTOR = 99

const ROLES = [
  { id: 1, key: 'elder', isBuiltIn: true },
  { id: 2, key: 'assistant-servant', isBuiltIn: true },
  { id: 3, key: 'sono' },
  { id: 4, key: 'coordinator', isBuiltIn: true, isSinglePerson: true },
  { id: 5, key: 'secretary', isBuiltIn: true, isSinglePerson: true },
  { id: 6, key: 'service-overseer', isBuiltIn: true, isSinglePerson: true },
  { id: 7, key: 'responsable-audio-video', isSinglePerson: true },
  { id: 8, key: 'service-committee', isBuiltIn: true },
]
const ID = Object.fromEntries(ROLES.map(role => [role.key, role.id]))

// 500 has a login, 501 has none, 502 and 503 are other people with logins.
let store: ReturnType<typeof createRoleStore>

function seed(memberId: number, key: string, kind = 'member') {
  store.records.push({ memberId, roleId: ID[key] as number, congregationId: CONGREGATION, kind })
}

const seat = (memberId: number, key: string, kind: 'leader' | 'deputy' | 'member') =>
  seatMember(store.db, { roleId: ID[key] as number, memberId, kind }, CONGREGATION, ACTOR, ADMIN_ACTOR)

beforeEach(() => {
  vi.clearAllMocks()
  store = createRoleStore(CONGREGATION, ROLES, [
    { memberId: 500, userId: 800 },
    { memberId: 501, userId: null },
    { memberId: 502, userId: 802 },
    { memberId: 503, userId: 803 },
  ])
})

describe('seatMember', () => {
  it('writes the seat on the person’s record', async () => {
    await seat(500, 'sono', 'leader')
    expect(store.records).toEqual([{ memberId: 500, roleId: 3, congregationId: CONGREGATION, kind: 'leader' }])
    expect(store.logins).toEqual([])
  })

  it('seats a publisher who has no login', async () => {
    await seat(501, 'sono', 'deputy')
    expect(store.seatsOf(501)).toEqual(['sono:deputy'])
  })

  it.each(['elder', 'assistant-servant'])('refuses to seat someone in the auto-synced %s roster', async key => {
    await expect(seat(500, key, 'member')).rejects.toBeInstanceOf(ForbiddenError)
    expect(store.records).toEqual([])
  })

  it('changes the seat kind when the person is already in the node', async () => {
    seed(500, 'sono', 'member')
    await seat(500, 'sono', 'leader')
    expect(store.seatsOf(500)).toEqual(['sono:leader'])
  })

  it('moves a seat older code left on the login onto the record', async () => {
    store.logins.push({ userId: 800, roleId: 3, congregationId: CONGREGATION, kind: 'member' })
    await seat(500, 'sono', 'deputy')
    expect(store.logins).toEqual([])
    expect(store.records).toEqual([{ memberId: 500, roleId: 3, congregationId: CONGREGATION, kind: 'deputy' }])
  })
})

describe('seatMember — the three committee posts', () => {
  it.each(['coordinator', 'secretary', 'service-overseer'])(
    'hands %s over instead of adding a second holder',
    async key => {
      // There is exactly one coordinator. Seating a new one is the handover: the outgoing holder loses the post.
      seed(500, 'elder')
      seed(502, key, 'leader')
      await seat(500, key, 'leader')
      expect(store.seatsOf(500)).toContain(`${key}:leader`)
      expect(store.seatsOf(502)).toEqual([])
    },
  )

  it('hands a post over from a titulaire whose seat is still on the login', async () => {
    seed(500, 'elder')
    store.logins.push({ userId: 803, roleId: ID.coordinator as number, congregationId: CONGREGATION, kind: 'leader' })
    await seat(500, 'coordinator', 'leader')
    expect(store.seatsOf(503)).toEqual([])
  })

  it.each(['coordinator', 'secretary', 'service-overseer'])('refuses a %s who is not an elder', async key => {
    seed(502, key, 'leader')
    await expect(seat(500, key, 'leader')).rejects.toBeInstanceOf(ValidationError)
    // A refusal never leaves the post vacant.
    expect(store.seatsOf(502)).toEqual([`${key}:leader`])
  })

  it('names an elder without a login to a post', async () => {
    seed(501, 'elder')
    await seat(501, 'coordinator', 'leader')
    expect(store.seatsOf(501)).toEqual(['coordinator:leader', 'elder:member'])
  })

  it('joins the new holder to the committee, which is made of its three posts', async () => {
    seed(500, 'elder')
    await seat(500, 'coordinator', 'leader')
    expect(syncServiceCommitteeMembers).toHaveBeenCalledWith(store.db, CONGREGATION, ACTOR)
  })

  it('does not touch the committee when an ordinary service is seated', async () => {
    await seat(500, 'sono', 'member')
    expect(syncServiceCommitteeMembers).not.toHaveBeenCalled()
  })

  it('leaves an ordinary service free to hold several people', async () => {
    seed(502, 'sono', 'leader')
    await seat(500, 'sono', 'leader')
    expect(store.seatsOf(502)).toEqual(['sono:leader'])
    expect(store.seatsOf(500)).toEqual(['sono:leader'])
  })

  it('stores a post holder as its leader, whatever kind was submitted', async () => {
    seed(500, 'elder')
    await seat(500, 'coordinator', 'member')
    expect(store.seatsOf(500)).toContain('coordinator:leader')
  })

  it('lets a post take an adjoint who is not an elder', async () => {
    await seat(500, 'coordinator', 'deputy')
    expect(store.seatsOf(500)).toEqual(['coordinator:deputy'])
  })
})

describe('seatMember — single-person roles', () => {
  it('hands the titular seat over, like a committee post', async () => {
    seed(502, 'responsable-audio-video', 'leader')
    await seat(500, 'responsable-audio-video', 'leader')
    expect(store.seatsOf(502)).toEqual([])
    expect(store.seatsOf(500)).toEqual(['responsable-audio-video:leader'])
  })

  it('leaves the adjoints in place through a handover', async () => {
    seed(502, 'responsable-audio-video', 'leader')
    seed(503, 'responsable-audio-video', 'deputy')
    await seat(500, 'responsable-audio-video', 'leader')
    expect(store.seatsOf(503)).toEqual(['responsable-audio-video:deputy'])
  })

  it('seats an adjoint without touching the titulaire', async () => {
    seed(502, 'responsable-audio-video', 'leader')
    await seat(500, 'responsable-audio-video', 'deputy')
    expect(store.seatsOf(502)).toEqual(['responsable-audio-video:leader'])
    expect(store.seatsOf(500)).toEqual(['responsable-audio-video:deputy'])
  })

  it('has no plain members: an unqualified seat is the titular one', async () => {
    await seat(500, 'responsable-audio-video', 'member')
    expect(store.seatsOf(500)).toEqual(['responsable-audio-video:leader'])
  })

  it('hands the seat to a publisher without a login', async () => {
    seed(502, 'responsable-audio-video', 'leader')
    await seat(501, 'responsable-audio-video', 'leader')
    expect(store.seatsOf(501)).toEqual(['responsable-audio-video:leader'])
    expect(store.seatsOf(502)).toEqual([])
  })

  it('does not reconcile the committee for an ordinary personal role', async () => {
    await seat(500, 'responsable-audio-video', 'leader')
    expect(syncServiceCommitteeMembers).not.toHaveBeenCalled()
  })
})

describe('unseatMember', () => {
  it('removes only that person from only that node', async () => {
    seed(500, 'sono', 'leader')
    seed(500, 'responsable-audio-video', 'leader')
    seed(502, 'sono', 'member')
    await unseatMember(store.db, ID.sono as number, 500, CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(store.seatsOf(500)).toEqual(['responsable-audio-video:leader'])
    expect(store.seatsOf(502)).toEqual(['sono:member'])
  })

  it('unseats a publisher without a login', async () => {
    seed(501, 'sono', 'deputy')
    await unseatMember(store.db, ID.sono as number, 501, CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(store.seatsOf(501)).toEqual([])
  })

  it('takes the outgoing holder out of the committee too', async () => {
    // Half a handover is worse than none: the committee follows its posts.
    seed(500, 'secretary', 'leader')
    await unseatMember(store.db, ID.secretary as number, 500, CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(syncServiceCommitteeMembers).toHaveBeenCalledWith(store.db, CONGREGATION, ACTOR)
  })
})
