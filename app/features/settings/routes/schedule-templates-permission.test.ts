import { beforeEach, describe, expect, it, vi } from 'vitest'

// The settings layout admits the programme managers and the kinds' responsibles too, but naming who answers for a
// schedule template is the template managers' (CanManageProgramTemplates): the page checks it itself, loader and
// action alike. Services are stubbed: nothing here reaches a database.

const { saved } = vi.hoisted(() => ({ saved: [] as unknown[] }))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, run: (db: unknown, congregationId: number) => unknown) => run({}, 1),
}))
vi.mock('~/features/events/index.server', () => ({
  listScheduleTemplatesForSettings: vi.fn(async () => [
    {
      id: 3,
      name: 'Réunion de semaine',
      key: null,
      kind: 'programme',
      items: 15,
      responsibleRole: null,
      kinds: [{ id: 270, name: 'Réunion de semaine' }],
      schedules: 4,
    },
  ]),
  updateScheduleTemplate: vi.fn(async (_db: unknown, id: number, change: unknown) => {
    saved.push([id, change])
    return { ok: true }
  }),
}))
vi.mock('~/shared/domain/roles.server', () => ({ listDelegatableRoles: vi.fn(async () => []) }))
vi.mock('~/features/settings/server/role-holders.queries', () => ({ holdersOfRoles: vi.fn(async () => new Map()) }))
vi.mock('./_toast.server', () => ({ okWithToast: vi.fn(async () => ({ ok: true })) }))
vi.mock('~/features/settings/server/schedule-template-items.queries', () => ({
  getScheduleTemplateItems: vi.fn(async () => null),
}))
vi.mock('~/features/settings/server/schedule-template-item-action.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/features/settings/server/schedule-template-item-action.server')>()),
  handleScheduleTemplateItem: vi.fn(async (_db: unknown, id: number, formData: FormData) => {
    saved.push(['item', id, formData.get('intent')])
    return { kind: 'saved', message: 'ok' }
  }),
}))

const { Permission } = await import('~/shared/types/permission')
const { formRequest, respond, routeContext } = await import('~/tests/helpers/route-action')
const { action, loader } = await import('./schedule-templates')

const URL = 'https://unitae.example.test/settings/schedule-templates'
const OTHER_RIGHTS = [[Permission.CanManagePrograms], [Permission.CanViewPrograms], []]

beforeEach(() => {
  saved.length = 0
})

describe('schedule-templates loader', () => {
  it('lists the templates for a template manager', async () => {
    const result = await loader({
      request: new Request(URL),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)

    expect(result.templates.map(template => template.title)).toEqual(['Réunion de semaine'])
  })

  it.each(OTHER_RIGHTS)('sends anyone else back to Réglages (%s)', async (...rights) => {
    const response = await respond(() =>
      loader({ request: new Request(URL), params: {}, context: routeContext(rights) } as never),
    )

    expect(response.headers.get('Location')).toBe('/settings')
  })
})

describe('schedule-templates action', () => {
  it('saves for a template manager, leaving out a responsible the post leaves out', async () => {
    await action({
      request: formRequest(URL, { scheduleTemplateId: '3', name: 'Vie et ministère' }),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)

    expect(saved).toEqual([[3, { name: 'Vie et ministère' }]])
  })

  it.each(OTHER_RIGHTS)('refuses anyone else before saving anything (%s)', async (...rights) => {
    const response = await respond(() =>
      action({
        request: formRequest(URL, { scheduleTemplateId: '3', name: 'X', responsibleRoleId: '12' }),
        params: {},
        context: routeContext(rights),
      } as never),
    )

    expect(response.headers.get('Location')).toBe('/settings')
    expect(saved).toEqual([])
  })

  it('answers a refused post for the template it names, with the field’s message', async () => {
    const result = await action({
      request: formRequest(URL, { scheduleTemplateId: '3', name: 'x'.repeat(81) }),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)

    expect(result).toMatchObject({ data: { ok: false, templateId: 3, errors: ['Le nom : 80 caractères au plus.'] } })
    expect(saved).toEqual([])
  })

  it('writes an item of the template named in the address, for a template manager', async () => {
    await action({
      request: formRequest(`${URL}?template=3`, { intent: 'upsert-part', partName: 'Prière' }),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)

    expect(saved).toEqual([['item', 3, 'upsert-part']])
  })

  it.each(OTHER_RIGHTS)('refuses an item to anyone else, writing nothing (%s)', async (...rights) => {
    const response = await respond(() =>
      action({
        request: formRequest(`${URL}?template=3`, { intent: 'delete-part', partId: '11' }),
        params: {},
        context: routeContext(rights),
      } as never),
    )

    expect(response.headers.get('Location')).toBe('/settings')
    expect(saved).toEqual([])
  })
})
