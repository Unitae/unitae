import { beforeEach, describe, expect, it, vi } from 'vitest'

// « Modifier le planning » (D38): the editor's loader narrowed to one schedule, for whoever fills it. The editor's
// own guards are its route's tests; here only what the page adds.

const state = vi.hoisted(() => ({ canFillParts: true, canFillServices: false }))

vi.mock('./edit', () => ({
  loader: () =>
    Promise.resolve({
      event: {
        id: 40,
        schedules: [
          { id: 1, kind: 'programme', name: null },
          { id: 2, kind: 'duty', name: 'Services' },
        ],
      },
      canFillParts: state.canFillParts,
      canFillServices: state.canFillServices,
    }),
  action: vi.fn(),
}))

const { loader } = await import('./schedule-edit')
const { respond } = await import('~/tests/helpers/route-action')

const load = (scheduleId: string) => loader({ params: { eventId: '40', scheduleId }, context: {} } as never)

beforeEach(() => {
  state.canFillParts = true
  state.canFillServices = false
})

describe('« Modifier le planning »', () => {
  it('narrows the editor to the schedule the reader fills', async () => {
    expect(await load('1')).toMatchObject({ focus: { id: 1, kind: 'programme', name: null } })
  })

  it('sends back to the event a schedule the reader does not fill, or one that is not the event’s', async () => {
    for (const scheduleId of ['2', '99']) {
      const response = await respond(() => load(scheduleId))
      expect(response.headers.get('Location')).toBe('/programs/events/40')
    }
  })
})
