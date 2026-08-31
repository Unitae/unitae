import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'
import { PublisherType } from '~/shared/types/publisher-type'

// The credit gate lives in the action, not the form: the field is merely hidden for
// non-secretaries, so a crafted POST with creditHours must be stripped server-side. Three
// actors matter — the secretary (CanCorrectActivity) whose submit writes the credit, an
// editor without that permission whose submit must leave the stored credit untouched, and
// a group responsible reaching the action through the group bypass with no global
// permission at all.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')

const updatePublisherActivity = vi.fn()
const activityFindUnique = vi.fn()

vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) =>
    fn({ publisherActivity: { findUnique: activityFindUnique } }),
}))

vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn().mockResolvedValue({ flash: vi.fn() }),
  commitSession: vi.fn().mockResolvedValue('cookie'),
}))

vi.mock('~/features/publishers/server/publisher-activity-mutations.server', () => ({ updatePublisherActivity }))

const { action } = await import('./edit')

type Actor = { permissions: Permission[]; member?: unknown }

const SECRETARY: Actor = { permissions: [Permission.CanManagePublishers, Permission.CanCorrectActivity] }
const ELDER: Actor = { permissions: [Permission.CanManagePublishers] }
const GROUP_RESPONSIBLE: Actor = {
  permissions: [],
  member: { publisherGroupId: 4, responsibleFor: { id: 4 }, deputyFor: null },
}

function submit(actor: Actor, fields: Record<string, string>) {
  const body = new FormData()
  body.set('type', PublisherType.PionnierPermanant)
  body.set('hours', '30')
  body.set('studies', '0')
  body.set('observations', '')
  for (const [key, value] of Object.entries(fields)) body.set(key, value)
  return action({
    params: { activityId: '9' },
    request: new Request('http://localhost/publishers/activity/9/edit', { method: 'POST', body }),
    context: {
      get: (key: symbol) =>
        key === permissionsContext
          ? new Set(actor.permissions)
          : { id: 1, congregationId: 10, member: actor.member ?? null },
    },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  activityFindUnique.mockResolvedValue({
    id: 9,
    month: 6,
    year: 2026,
    publisher: { firstname: 'D', lastname: 'B' },
  })
  updatePublisherActivity.mockResolvedValue({ id: 9 })
})

describe('the credit gate in the edit action', () => {
  it('forwards the secretary’s credit, and maps an emptied field to an explicit clear', async () => {
    await submit(SECRETARY, { creditHours: '20' })
    expect(updatePublisherActivity).toHaveBeenCalledWith(
      expect.anything(),
      9,
      10,
      1,
      expect.objectContaining({ creditHours: 20 }),
    )

    vi.clearAllMocks()
    activityFindUnique.mockResolvedValue({ id: 9, month: 6, year: 2026, publisher: { firstname: 'D', lastname: 'B' } })
    updatePublisherActivity.mockResolvedValue({ id: 9 })
    await submit(SECRETARY, { creditHours: '' })
    expect(updatePublisherActivity).toHaveBeenCalledWith(
      expect.anything(),
      9,
      10,
      1,
      expect.objectContaining({ creditHours: null }),
    )
  })

  it('strips a crafted creditHours from an editor without CanCorrectActivity', async () => {
    await submit(ELDER, { creditHours: '999' })

    const params = updatePublisherActivity.mock.calls[0]?.[4]
    expect(params).not.toHaveProperty('creditHours')
  })

  it('strips it from a group responsible on the group bypass too', async () => {
    await submit(GROUP_RESPONSIBLE, { creditHours: '999' })

    const params = updatePublisherActivity.mock.calls[0]?.[4]
    expect(params).not.toHaveProperty('creditHours')
  })
})
