import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/events/index.server', () => ({ deleteScheduleTemplate: vi.fn() }))

const { deleteScheduleTemplate } = await import('~/features/events/index.server')
const { handleDeleteScheduleTemplate } = await import('./schedule-template-delete-action.server')

const ACTOR = { id: 7, congregationId: 1 }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('handleDeleteScheduleTemplate', () => {
  it('deletes the template the address names', async () => {
    vi.mocked(deleteScheduleTemplate).mockResolvedValue({ name: 'Visite', kinds: [], schedules: 0 })
    expect(await handleDeleteScheduleTemplate({} as never, '12', ACTOR)).toEqual({ ok: true })
    expect(vi.mocked(deleteScheduleTemplate).mock.calls[0]?.slice(1)).toEqual([12, 1, 7])
  })

  it('says a template no longer there is gone, and refuses an id that is not one before any write', async () => {
    vi.mocked(deleteScheduleTemplate).mockResolvedValue(null)
    expect(await handleDeleteScheduleTemplate({} as never, '12', ACTOR)).toEqual({
      ok: false,
      errors: [expect.any(String)],
    })
    vi.mocked(deleteScheduleTemplate).mockClear()
    expect(await handleDeleteScheduleTemplate({} as never, 'abc', ACTOR)).toEqual({
      ok: false,
      errors: [expect.any(String)],
    })
    expect(deleteScheduleTemplate).not.toHaveBeenCalled()
  })
})
