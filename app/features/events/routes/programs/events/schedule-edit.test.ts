import { beforeEach, describe, expect, it, vi } from 'vitest'

// « Modifier le planning » (D38): the editor's loader narrowed to one schedule, for whoever fills it. The editor
// guards changing the event (its own loader, faked here); the page adds the schedule's, tested here.

// The duties schedules the reader fills, each its own responsible's (a meeting may hold several).
const state = vi.hoisted(() => ({ canFillParts: true, canFillServices: false, fillable: [] as number[] }))

vi.mock('./edit', () => ({
  loader: () =>
    Promise.resolve({
      event: {
        id: 40,
        schedules: [
          { id: 1, kind: 'programme', name: null },
          { id: 2, kind: 'duty', name: 'Services' },
          { id: 3, kind: 'duty', name: 'Visioconférence' },
        ],
      },
      canFillParts: state.canFillParts,
      canFillServices: state.canFillServices,
      fillableSchedules: state.fillable,
    }),
  action: vi.fn(),
}))

const { loader } = await import('./schedule-edit')
const { respond } = await import('~/tests/helpers/route-action')

const load = (scheduleId: string) => loader({ params: { eventId: '40', scheduleId }, context: {} } as never)

beforeEach(() => {
  state.canFillParts = true
  state.canFillServices = false
  state.fillable = []
})

describe('« Modifier le planning »', () => {
  it('narrows the editor to the schedule the reader fills', async () => {
    expect(await load('1')).toMatchObject({ focus: { id: 1, kind: 'programme', name: null } })
    state.canFillParts = false
    state.fillable = [2]
    expect(await load('2')).toMatchObject({ focus: { id: 2, kind: 'duty', name: 'Services' }, canFillServices: true })
  })

  it('opens a duties schedule to its own responsible alone', async () => {
    state.canFillParts = false
    state.fillable = [3]
    expect(await load('3')).toMatchObject({ focus: { id: 3, name: 'Visioconférence' } })
    const response = await respond(() => load('2'))
    expect(response.headers.get('Location')).toBe('/programs/events/40')
  })

  it('sends a duties filler back from the programme’s page', async () => {
    state.canFillParts = false
    state.fillable = [2]
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
