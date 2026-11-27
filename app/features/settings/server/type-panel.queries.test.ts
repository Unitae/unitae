import { beforeEach, describe, expect, it, vi } from 'vitest'

// What a meeting type's side panel reads (6b-2b): its own fields, its empty meetings to move, the templates it uses and
// those it may come to use (one programme, any duties templates).

vi.mock('~/features/events/index.server', () => ({ countMeetingsToMove: vi.fn() }))
vi.mock('~/features/settings/server/template-page.queries', () => ({ getTemplatePage: vi.fn() }))

const { countMeetingsToMove } = await import('~/features/events/index.server')
const { getTemplatePage } = await import('~/features/settings/server/template-page.queries')
const { getTypePanel } = await import('./type-panel.queries')

const listed = (id: number, kind: 'programme' | 'duty', kinds: string[] = []) => ({
  id,
  name: `Modèle ${id}`,
  key: null,
  kind,
  items: 2,
  responsibleRole: null,
  kinds: kinds.map((name, index) => ({ id: index + 1, name })),
  schedules: 0,
  rooms: 1,
})

const page = (key: string, used: ReturnType<typeof listed>[], all: ReturnType<typeof listed>[]) => ({
  template: {
    id: 4,
    key,
    name: 'Réunion de semaine',
    color: '#0b6e75',
    weekDay: 4,
    startTime: '19:00',
    endTime: '20:45',
    attendanceKind: 'midweek',
    parts: [{ id: 1 }],
  },
  eventCount: 3,
  scheduleTemplates: used,
  allScheduleTemplates: all,
  roles: [],
})

const context = { congregationId: 1, timeZone: 'Europe/Paris' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(countMeetingsToMove).mockResolvedValue(2)
})

describe('getTypePanel', () => {
  it('reads the type’s own fields and offers the templates of the sort it lacks, naming who uses them', async () => {
    const programme = listed(9, 'programme', ['Réunion de semaine'])
    const duty = listed(7, 'duty', ['Mémorial'])
    vi.mocked(getTemplatePage).mockResolvedValue(
      page('midweek-meeting', [programme], [programme, duty, listed(8, 'programme')]) as never,
    )

    const panel = await getTypePanel({} as never, 4, context)

    expect(Object.keys(panel?.template ?? {}).sort()).toEqual(
      ['attendanceKind', 'color', 'endTime', 'key', 'name', 'startTime', 'weekDay'].sort(),
    )
    expect(panel).toMatchObject({ id: 4, eventCount: 3, builtIn: false, meetingsToMove: 2 })
    expect(panel?.schedules.map(each => each.id)).toEqual([9])
    expect(panel?.candidates?.map(each => [each.id, each.suggestedBy])).toEqual([[7, 'Mémorial']])
  })

  // A second unnamed duties template would be refused: shown greyed, with why (user, 2026-11-27).
  it('greys an unnamed duties template beside the unnamed one it uses, not a named one', async () => {
    const used = [listed(9, 'programme'), { ...listed(7, 'duty'), name: null, key: 'services' }]
    const all = [...used, { ...listed(6, 'duty'), name: null, key: 'services' }, listed(5, 'duty')]
    // Unnamed: no name, a key (as the per-type templates the seed made).
    vi.mocked(getTemplatePage).mockResolvedValue(page('midweek-meeting', used as never, all as never) as never)
    const candidates = (await getTypePanel({} as never, 4, context))?.candidates ?? []
    expect(candidates.map(each => [each.id, 'unavailable' in each ? each.unavailable : null])).toEqual([
      [6, 'unnamed'],
      [5, null],
    ])
  })

  // One programme at most, every duties template once (user, 2026-11-27).
  it('offers the duties templates it does not use, and no programme once it uses one', async () => {
    const used = [listed(9, 'programme'), listed(7, 'duty')]
    const all = [...used, listed(8, 'programme'), listed(6, 'duty')]
    vi.mocked(getTemplatePage).mockResolvedValue(page('midweek-meeting', used, all) as never)
    expect((await getTypePanel({} as never, 4, context))?.candidates?.map(each => each.id)).toEqual([6])
  })

  it('counts no meetings to move for a built-in type, and answers null for a type it cannot read', async () => {
    vi.mocked(getTemplatePage).mockResolvedValueOnce(page('freeform', [], []) as never)
    // The count answers 2 when asked: 0 says it was not.
    expect(await getTypePanel({} as never, 4, context)).toMatchObject({ builtIn: true, meetingsToMove: 0 })

    vi.mocked(getTemplatePage).mockResolvedValueOnce(null)
    expect(await getTypePanel({} as never, 5, context)).toBeNull()
  })
})
