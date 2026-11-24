import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/events/server/event-parts.server', () => ({
  addPartAssignment: vi.fn(),
  addServicePartAssignment: vi.fn(),
  deletePartAssignment: vi.fn(),
  deleteServicePartAssignment: vi.fn(),
  updateEvent: vi.fn(),
  updatePartAssignment: vi.fn(),
  updateServicePartAssignment: vi.fn(),
}))

const { handleEditIntent, kindsFilledBy } = await import('./_edit-event-intents.server')
const { deletePartAssignment, deleteServicePartAssignment, updatePartAssignment, updateServicePartAssignment } =
  await import('~/features/events/server/event-parts.server')

const db = {} as Parameters<typeof handleEditIntent>[2]
const EVENT_ID = 31
const CONGREGATION_ID = 4242
const USER_ID = 7777
const _OWNED_TEMPLATE_ID = 1001
const _FOREIGN_TEMPLATE_ID = 2002
// Parts and services: the first item belongs to the event in the URL, the second to another event. The old row the
// first mirrors has its own id, which a form of the previous image posts under the old name (plan T12).
const OWN_ID = 11
const FOREIGN_ID = 22
const OWN_LEGACY_ID = 911

const checks = {
  // The route's check: the item a form names, by its id or its old row's, when it is on this event.
  itemInEvent: async (_kind: 'part' | 'service', { itemId, legacyId }: { itemId?: string; legacyId?: string }) => {
    const id = itemId != null ? Number(itemId) : legacyId === String(OWN_LEGACY_ID) ? OWN_ID : null
    return id === OWN_ID ? id : null
  },
}

function post(fields: Record<string, string>) {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return handleEditIntent(fields.intent, formData, db, EVENT_ID, CONGREGATION_ID, USER_ID, 'Europe/Paris', checks)
}

beforeEach(() => {
  vi.resetAllMocks()
})

// The action checked that the caller may edit the event in the URL. The writers find a part or a service by its id
// alone, so an id from another event of the congregation must not ride on that check.
const INTENTS: [string, (id: number) => Record<string, string>][] = [
  ['update-part', id => ({ partItemId: String(id), partName: 'Lecture de la Bible' })],
  ['delete-part', id => ({ partItemId: String(id) })],
  ['update-service', id => ({ serviceItemId: String(id), serviceName: 'Sono' })],
  ['delete-service', id => ({ serviceItemId: String(id) })],
]

// The same intents as a form the previous image rendered posts them during the rollout: the old row's id, old names.
const LEGACY_INTENTS: [string, (id: number) => Record<string, string>, () => unknown][] = [
  [
    'update-part',
    id => ({ partAssignmentId: String(id), partName: 'Lecture de la Bible' }),
    () => updatePartAssignment,
  ],
  ['delete-part', id => ({ partAssignmentId: String(id) }), () => deletePartAssignment],
  [
    'update-service',
    id => ({ serviceAssignmentId: String(id), serviceName: 'Sono' }),
    () => updateServicePartAssignment,
  ],
  ['delete-service', id => ({ serviceAssignmentId: String(id) }), () => deleteServicePartAssignment],
]

describe('handleEditIntent — parts and services', () => {
  it.each(INTENTS)('%s refuses a part or service of another event', async (intent, fields) => {
    const result = await post({ intent, ...fields(FOREIGN_ID) })
    expect(result != null && 'reply' in result).toBe(true)
  })

  it.each(INTENTS)('%s goes through for a part or service of this event', async (intent, fields) => {
    const result = await post({ intent, ...fields(OWN_ID) })
    expect(result != null && 'message' in result).toBe(true)
  })

  it.each(LEGACY_INTENTS)(
    '%s from a previous form writes the item its old id names',
    async (intent, fields, writer) => {
      const result = await post({ intent, ...fields(OWN_LEGACY_ID) })
      expect(result != null && 'message' in result).toBe(true)
      expect(vi.mocked(writer() as (...args: unknown[]) => unknown).mock.calls[0][1]).toBe(OWN_ID)
    },
  )

  it.each(INTENTS)('%s refuses a form naming no item', async intent => {
    const result = await post({ intent, partName: 'Lecture de la Bible', serviceName: 'Sono' })
    expect(result != null && 'reply' in result).toBe(true)
  })
})

// The schedules an intent fills, whose right the route checks on top of the event's (plan §10, D31).
describe('kindsFilledBy', () => {
  it('names the schedule a part or a duty intent fills', () => {
    expect(['add-part', 'update-part', 'delete-part'].map(kindsFilledBy)).toEqual([['part'], ['part'], ['part']])
    expect(['add-service', 'update-service', 'delete-service'].map(kindsFilledBy)).toEqual([
      ['service'],
      ['service'],
      ['service'],
    ])
  })

  it('names none for changing the event itself, an intent it no longer knows, or one it never did', () => {
    expect(kindsFilledBy('apply-template')).toEqual([])
    expect(kindsFilledBy('update-event')).toEqual([])
    expect(kindsFilledBy(null)).toEqual([])
    expect(kindsFilledBy('toString')).toEqual([])
  })
})
