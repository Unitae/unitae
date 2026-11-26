import { beforeEach, describe, expect, it, vi } from 'vitest'

// Since 6a-1c a meeting type is the templates' managers' alone (CanManageProgramTemplates): its responsible, a
// programme reader or a programme manager without that right is sent away from the list, the type's page and its
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

describe('a meeting type’s page', () => {
  it.each(OTHER_RIGHTS)('sends anyone else back to the list, before reading it (%s)', async (...rights) => {
    const response = await respond(() =>
      template.loader({
        request: new Request(`${URL}/270`),
        params: { templateId: '270' },
        context: routeContext(rights),
      } as never),
    )
    expect(response.headers.get('Location')).toBe('/settings/templates')
    expect(calls).toEqual([])
  })

  it.each(OTHER_RIGHTS)('refuses its actions to anyone else, writing nothing (%s)', async (...rights) => {
    const response = await respond(() =>
      template.action({
        request: formRequest(`${URL}/270`, { intent: 'update-template', name: 'Renommée' }),
        params: { templateId: '270' },
        context: routeContext(rights),
      } as never),
    )
    expect(response.headers.get('Location')).toBe('/settings/templates')
    expect(calls).toEqual([])
  })
})

describe('the meeting type page, what it sends', () => {
  it('sends the type’s own fields only: its parts and services are « Modèles de planning »’s', async () => {
    const result = (await template.loader({
      request: new Request(`${URL}/4`),
      params: { templateId: '4' },
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)) as { page: { template: Record<string, unknown>; eventCount: number } }
    expect(Object.keys(result.page.template).sort()).toEqual(
      ['attendanceKind', 'color', 'endTime', 'key', 'name', 'startTime', 'weekDay'].sort(),
    )
    expect(result.page.eventCount).toBe(3)
  })
})
