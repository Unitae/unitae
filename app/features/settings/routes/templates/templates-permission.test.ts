import { beforeEach, describe, expect, it, vi } from 'vitest'

// Since 6a-1c a meeting type is the templates' managers' alone (CanManageProgramTemplates): its responsible, a
// programme reader or a programme manager without that right is sent away from the list, the type's panel and its
// actions, and nothing is written. Services are stubbed: nothing here reaches a database.

const { calls } = vi.hoisted(() => ({ calls: [] as string[] }))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, run: (db: unknown, congregationId: number) => unknown) => run({}, 1),
}))
vi.mock('~/features/events/index.server', () => ({
  getTemplates: vi.fn(async () => {
    calls.push('getTemplates')
    return []
  }),
  countMeetingsToMove: vi.fn(async () => 0),
}))
vi.mock('~/shared/domain/settings.server', () => ({ getBoolSetting: vi.fn(async () => false) }))
vi.mock('~/features/settings/server/template-page.queries', () => ({
  getTemplatePage: vi.fn(async () => {
    calls.push('getTemplatePage')
    // The whole type, its parts and services with it, as getTemplateById reads it.
    return {
      template: {
        id: 4,
        key: 'midweek-meeting',
        name: 'Réunion de semaine',
        color: '#0b6e75',
        weekDay: 4,
        startTime: '19:00',
        endTime: '20:45',
        attendanceKind: 'midweek',
        parts: [{ id: 1, name: 'Joyaux' }],
        serviceParts: [{ id: 2, name: 'Sono' }],
        responsibles: [],
      },
      eventCount: 3,
      scheduleTemplates: [],
      allScheduleTemplates: [],
      roles: [],
    }
  }),
}))
vi.mock('./_template-action.server', () => ({
  handleTemplateAction: vi.fn(async () => {
    calls.push('handleTemplateAction')
    return { kind: 'saved', message: 'ok' }
  }),
}))

const { Permission } = await import('~/shared/types/permission')
const { formRequest, respond, routeContext } = await import('~/tests/helpers/route-action')
const list = await import('./list')
const { getTemplates } = await import('~/features/events/index.server')
const template = await import('./template')

const URL = 'https://unitae.example.test/settings/templates'
const OTHER_RIGHTS = [[Permission.CanViewPrograms], [Permission.CanManagePrograms], []]

beforeEach(() => {
  calls.length = 0
})

describe('the meeting types list', () => {
  it('shows the types to a template manager', async () => {
    const result = await list.loader({
      request: new Request(URL),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)
    expect(result).toMatchObject({ templates: [] })
  })

  it.each(OTHER_RIGHTS)('sends anyone else back to Réglages (%s)', async (...rights) => {
    const response = await respond(() =>
      list.loader({ request: new Request(URL), params: {}, context: routeContext(rights) } as never),
    )
    expect(response.headers.get('Location')).toBe('/settings')
    expect(calls).toEqual([])
  })
})

// A type's own page became its side panel on the list (6b-2b): the old address leads there, reading nothing.
describe('a meeting type’s old page', () => {
  it('leads to the type in the list’s panel, before reading anything', async () => {
    const response = await respond(() =>
      template.loader({
        request: new Request(`${URL}/270`),
        params: { templateId: '270' },
        context: routeContext([]),
      } as never),
    )
    expect(response.headers.get('Location')).toBe('/settings/templates?type=270')
    expect(calls).toEqual([])
  })
})

describe('a meeting type’s side panel', () => {
  it.each(OTHER_RIGHTS)('refuses its actions to anyone else, writing nothing (%s)', async (...rights) => {
    const response = await respond(() =>
      list.action({
        request: formRequest(URL, { intent: 'update-template', typeId: '270', name: 'Renommée' }),
        params: {},
        context: routeContext(rights),
      } as never),
    )
    expect(response.headers.get('Location')).toBe('/settings')
    expect(calls).toEqual([])
  })

  it('sends the type’s own fields only: its parts and services are « Modèles de planning »’s', async () => {
    vi.mocked(getTemplates).mockResolvedValueOnce([
      {
        id: 4,
        key: 'midweek-meeting',
        name: 'Réunion de semaine',
        _count: {},
        scheduleTemplates: [],
        responsibles: [],
      },
    ] as never)
    const result = (await list.loader({
      request: new Request(`${URL}?type=4`),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)) as { type: { template: Record<string, unknown>; eventCount: number } }
    expect(Object.keys(result.type.template).sort()).toEqual(
      ['attendanceKind', 'color', 'endTime', 'key', 'name', 'startTime', 'weekDay'].sort(),
    )
    expect(result.type.eventCount).toBe(3)
  })

  it('opens no panel for a type the list does not hold', async () => {
    const result = (await list.loader({
      request: new Request(`${URL}?type=999`),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)) as { type: unknown }
    expect(result.type).toBeNull()
    expect(calls).not.toContain('getTemplatePage')
  })
})
