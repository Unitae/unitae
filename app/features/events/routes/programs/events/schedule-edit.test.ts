import { beforeEach, describe, expect, it, vi } from 'vitest'

// « Modifier le planning » (D38): the editor's loader narrowed to one schedule, for whoever fills it. The editor
// guards changing the event (its own loader, faked here); the page adds the schedule's, tested here.

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
    state.canFillParts = false
    state.canFillServices = true
    expect(await load('2')).toMatchObject({ focus: { id: 2, kind: 'duty', name: 'Services' } })
  })

  it('sends a duties filler back from the programme’s page', async () => {
    state.canFillParts = false
    state.canFillServices = true
    const response = await respond(() => load('1'))
    expect(response.headers.get('Location')).toBe('/programs/events/40')
  })

  it('sends back to the event a schedule the reader does not fill, or one that is not the event’s', async () => {
    for (const scheduleId of ['2', '99']) {
      const response = await respond(() => load(scheduleId))
      expect(response.headers.get('Location')).toBe('/programs/events/40')
    }
  })
})
