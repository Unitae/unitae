import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/events/index.server', () => ({ createScheduleTemplate: vi.fn() }))

const { createScheduleTemplate } = await import('~/features/events/index.server')
const { handleCreateScheduleTemplate } = await import('./schedule-template-create-action.server')

const ACTOR = { id: 7, congregationId: 1 }
const form = (fields: Record<string, string>) => {
  const data = new FormData()
  data.set('intent', 'create-template')
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(createScheduleTemplate).mockResolvedValue({ ok: true, id: 42 })
})

describe('handleCreateScheduleTemplate', () => {
  it('creates a template of services with its responsible, or of parts with none', async () => {
    expect(
      await handleCreateScheduleTemplate(
        {} as never,
        form({ name: 'Zoom', kind: 'duty', responsibleRoleId: '5' }),
        ACTOR,
      ),
    ).toEqual({ ok: true, id: 42 })
    await handleCreateScheduleTemplate(
      {} as never,
      form({ name: 'Visite', kind: 'programme', responsibleRoleId: 'none' }),
      ACTOR,
    )
    expect(vi.mocked(createScheduleTemplate).mock.calls.map(call => call[1])).toEqual([
      { name: 'Zoom', kind: 'duty', responsibleRoleId: 5 },
      { name: 'Visite', kind: 'programme', responsibleRoleId: null },
    ])
  })

  it('refuses a blank or long name, or an unknown kind, before writing', async () => {
    const blank = await handleCreateScheduleTemplate(
      {} as never,
      form({ name: ' ', kind: 'duty', responsibleRoleId: 'none' }),
      ACTOR,
    )
    const long = await handleCreateScheduleTemplate(
      {} as never,
      form({ name: 'x'.repeat(81), kind: 'duty', responsibleRoleId: 'none' }),
      ACTOR,
    )
    const kind = await handleCreateScheduleTemplate(
      {} as never,
      form({ name: 'A', kind: 'other', responsibleRoleId: 'none' }),
      ACTOR,
    )
    expect([blank.ok, long.ok, kind.ok]).toEqual([false, false, false])
    expect(blank).toMatchObject({ errors: ['Donnez-lui un nom.'] })
    expect(createScheduleTemplate).not.toHaveBeenCalled()
  })

  it('says why the service refused', async () => {
    vi.mocked(createScheduleTemplate).mockResolvedValueOnce({ ok: false, reason: 'role' })
    const result = await handleCreateScheduleTemplate(
      {} as never,
      form({ name: 'A', kind: 'duty', responsibleRoleId: '9' }),
      ACTOR,
    )
    expect(result).toEqual({ ok: false, errors: [expect.any(String)] })
  })
})
