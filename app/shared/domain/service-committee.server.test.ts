import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoleStore } from '~/tests/helpers/role-store'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { UserRoleAssignmentChanged: 'UserRoleAssignmentChanged' },
  audit: vi.fn(),
}))

const { syncServiceCommitteeMembers } = await import('./service-committee.server')
const { audit } = await import('~/shared/domain/audit.server')

const CONGREGATION = 10
const ACTOR = 99

const ROLES = [
  { id: 100, key: 'service-committee' },
  { id: 101, key: 'coordinator' },
  { id: 102, key: 'secretary' },
  { id: 103, key: 'service-overseer' },
]

let store: ReturnType<typeof createRoleStore>

function seat(memberId: number, roleId: number, kind = 'leader') {
  store.records.push({ memberId, roleId, congregationId: CONGREGATION, kind })
}
const committee = () =>
  store.records
    .filter(row => row.roleId === 100)
    .map(row => row.memberId)
    .sort()

beforeEach(() => {
  vi.clearAllMocks()
  store = createRoleStore(CONGREGATION, ROLES, [
    { memberId: 500, userId: 800 },
    { memberId: 501, userId: null },
    { memberId: 502, userId: 802 },
    { memberId: 503, userId: 803 },
  ])
})

describe('syncServiceCommitteeMembers', () => {
  it('puts the three post holders into the committee', async () => {
    // The committee IS the coordinator, the secretary and the service overseer: its membership is derived.
    seat(500, 101)
    seat(501, 102)
    seat(502, 103)
    await syncServiceCommitteeMembers(store.db, CONGREGATION, ACTOR)
    expect(committee()).toEqual([500, 501, 502])
  })

  it('takes out someone who no longer holds a post', async () => {
    seat(500, 101)
    seat(500, 100, 'member')
    seat(503, 100, 'member')
    await syncServiceCommitteeMembers(store.db, CONGREGATION, ACTOR)
    expect(committee()).toEqual([500])
  })

  it('takes out someone whose committee seat older code left on the login', async () => {
    seat(500, 101)
    store.logins.push({ userId: 803, roleId: 100, congregationId: CONGREGATION, kind: 'member' })
    await syncServiceCommitteeMembers(store.db, CONGREGATION, ACTOR)
    expect(store.logins).toEqual([])
    expect(committee()).toEqual([500])
  })

  it('counts a post held on the login through that login’s record', async () => {
    store.logins.push({ userId: 802, roleId: 101, congregationId: CONGREGATION, kind: 'leader' })
    await syncServiceCommitteeMembers(store.db, CONGREGATION, ACTOR)
    expect(committee()).toEqual([502])
  })

  it('writes nothing when the membership already matches', async () => {
    // Called after every seat, so a no-op stays a no-op: no rows churned, no audit for changes nobody made.
    seat(500, 101)
    seat(500, 100, 'member')
    await syncServiceCommitteeMembers(store.db, CONGREGATION, ACTOR)
    expect(vi.mocked(audit)).not.toHaveBeenCalled()
  })

  it('counts someone holding two posts once', async () => {
    seat(500, 101)
    seat(500, 102)
    await syncServiceCommitteeMembers(store.db, CONGREGATION, ACTOR)
    expect(committee()).toEqual([500])
  })

  it('does nothing when the congregation has no committee role', async () => {
    store = createRoleStore(CONGREGATION, ROLES.slice(1), [{ memberId: 500, userId: 800 }])
    seat(500, 101)
    await expect(syncServiceCommitteeMembers(store.db, CONGREGATION, ACTOR)).resolves.toBeUndefined()
    expect(committee()).toEqual([])
  })

  it('counts only the titular holders — a post’s adjoint is not on the committee', async () => {
    seat(500, 101)
    seat(503, 101, 'deputy')
    await syncServiceCommitteeMembers(store.db, CONGREGATION, ACTOR)
    expect(committee()).toEqual([500])
  })
})
