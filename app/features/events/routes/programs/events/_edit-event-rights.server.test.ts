import { describe, expect, it, vi } from 'vitest'

// The editor's rights over the schedules its intents write: a service intent names its duties schedule (a meeting may
// hold several), the posted one for an add, the item's own for an update or a delete; that schedule alone is asked.

vi.mock('~/features/events/server/schedule-rights.server', () => ({
  canFillSchedule: vi.fn(
    (
      _db: unknown,
      _can: unknown,
      _user: number,
      _event: unknown,
      kind: string,
      _c: number,
      scheduleId?: number | null,
    ) => {
      return Promise.resolve(kind !== 'service' || scheduleId === 7)
    },
  ),
}))

const { fillsWhatIntentWrites, serviceScheduleNamed } = await import('./_edit-event-rights.server')

const db = {
  item: {
    findFirst: ({ where }: { where: { id: number } }) =>
      Promise.resolve(where.id === 70 ? { scheduleId: 7 } : where.id === 80 ? { scheduleId: 8 } : null),
  },
} as never
const checks = {
  itemInEvent: (_kind: string, { itemId }: { itemId?: string }) =>
    Promise.resolve(itemId === '70' || itemId === '80' ? Number(itemId) : null),
}
const form = (fields: Record<string, string>) => {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return formData
}

describe('serviceScheduleNamed', () => {
  it('reads the posted schedule of an add, and the item’s own for an update or a delete', async () => {
    const named = (fields: Record<string, string>) =>
      serviceScheduleNamed(db, fields.intent ?? null, form(fields), checks, 1)
    expect(await named({ intent: 'add-service', scheduleId: '7' })).toBe(7)
    expect(await named({ intent: 'add-service', scheduleId: 'abc' })).toBeNull()
    expect(await named({ intent: 'update-service', serviceItemId: '80' })).toBe(8)
    expect(await named({ intent: 'delete-service', serviceItemId: '70' })).toBe(7)
    // An item of another event, and an intent writing no service, name none.
    expect(await named({ intent: 'update-service', serviceItemId: '99' })).toBeNull()
    expect(await named({ intent: 'add-part', scheduleId: '7' })).toBeNull()
  })
})

describe('fillsWhatIntentWrites', () => {
  const fills = (fields: Record<string, string>) =>
    fillsWhatIntentWrites(
      db,
      () => false,
      { userId: 3, congregationId: 1 },
      { id: 40, templateId: 2 },
      { intent: fields.intent ?? null, formData: form(fields) },
      checks,
    )

  it('asks for the schedule a service intent names, and nothing more of a part', async () => {
    expect(await fills({ intent: 'update-service', serviceItemId: '70' })).toBe(true)
    expect(await fills({ intent: 'update-service', serviceItemId: '80' })).toBe(false)
    // A part is asked of its kind (the mock lets any part through).
    expect(await fills({ intent: 'add-part' })).toBe(true)
  })

  it('lets through an intent writing no schedule, and refuses a service naming none', async () => {
    expect(await fills({ intent: 'update-event' })).toBe(true)
    expect(await fills({ intent: 'add-service' })).toBe(false)
  })
})
