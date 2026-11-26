import { beforeEach, describe, expect, it, vi } from 'vitest'

// The settings layout admits the programme managers and the kinds' responsibles too, but naming who answers for a
// schedule template is the template managers' (CanManageProgramTemplates): the page checks it itself, loader and
// action alike. Services are stubbed: nothing here reaches a database.

const { saved, outcome, itemsAsked } = vi.hoisted(() => ({
  saved: [] as unknown[],
  outcome: { current: 'saved' as 'saved' | 'refused' | 'none' | 'reordered' },
  itemsAsked: [] as number[],
}))

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
vi.mock('./_toast.server', () => ({
  okWithToast: vi.fn(async (_request: Request, _message: string, extra?: object) => ({ ok: true, ...extra })),
}))
vi.mock('~/features/settings/server/schedule-template-create-action.server', () => ({
  handleCreateScheduleTemplate: vi.fn(async (_db: unknown, formData: FormData) => {
    saved.push(['create', formData.get('name')])
    return formData.get('name') === '' ? { ok: false, errors: ['Donnez-lui un nom.'] } : { ok: true, id: 12 }
  }),
}))
vi.mock('~/features/settings/server/schedule-template-items.queries', () => ({
  getScheduleTemplateItems: vi.fn(async (_db: unknown, id: number) => {
    itemsAsked.push(id)
    return { kind: 'programme', kindId: 270, parts: [], services: [] }
  }),
}))
vi.mock('~/features/settings/server/schedule-template-item-action.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/features/settings/server/schedule-template-item-action.server')>()),
  handleScheduleTemplateItem: vi.fn(async (_db: unknown, id: number, formData: FormData) => {
    saved.push(['item', id, formData.get('intent')])
    if (outcome.current === 'none') return null
    if (outcome.current === 'reordered') return { kind: 'reordered' }
    if (outcome.current === 'refused') {
      const { data } = await import('react-router')
      return { kind: 'refused', response: data({ status: 'error' }, { status: 400 }) }
    }
    return { kind: 'saved', message: 'ok' }
  }),
}))

const { Permission } = await import('~/shared/types/permission')
const { formRequest, respond, routeContext } = await import('~/tests/helpers/route-action')
const { action, loader, shouldRevalidate } = await import('./schedule-templates')

const URL = 'https://unitae.example.test/settings/schedule-templates'
const OTHER_RIGHTS = [[Permission.CanManagePrograms], [Permission.CanViewPrograms], []]

beforeEach(() => {
  saved.length = 0
  itemsAsked.length = 0
  outcome.current = 'saved'
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

  it.each([
    'upsert-part',
    'delete-part',
    'upsert-service-role',
    'delete-service-role',
    'rename-section',
    'add-room',
    'rename-room',
    'delete-room',
    'reorder-rooms',
    'reorder-parts',
    'reorder-services',
  ])('sends the item intent %s to the item handler, a duties template’s too', async intent => {
    await action({
      request: formRequest(`${URL}?template=8`, { intent }),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)
    expect(saved).toEqual([['item', 8, intent]])
  })

  it.each(
    ['upsert-part', 'upsert-service-role', 'delete-service-role'].flatMap(intent =>
      OTHER_RIGHTS.map(rights => [intent, rights] as const),
    ),
  )('refuses %s to anyone else (%s)', async (intent, rights) => {
    const response = await respond(() =>
      action({
        request: formRequest(`${URL}?template=3`, { intent }),
        params: {},
        context: routeContext(rights),
      } as never),
    )
    expect(response.headers.get('Location')).toBe('/settings')
    expect(saved).toEqual([])
  })

  it('answers a template not there with a refusal, and passes the form’s refusal on', async () => {
    outcome.current = 'none'
    const gone = await action({
      request: formRequest(`${URL}?template=3`, { intent: 'delete-part', partId: '1' }),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)
    outcome.current = 'refused'
    const refused = await action({
      request: formRequest(`${URL}?template=3`, { intent: 'delete-part', partId: '1' }),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)
    expect(gone).toMatchObject({ init: { status: 409 }, data: { ok: false, templateId: 3 } })
    expect(refused).toMatchObject({ init: { status: 400 } })
  })

  it('refuses a template id that is not one, before any handler', async () => {
    const result = await action({
      request: formRequest(`${URL}?template=abc`, { intent: 'delete-part', partId: '1' }),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)
    expect(result).toMatchObject({ init: { status: 409 } })
    expect(saved).toEqual([])
  })
})

describe('schedule-templates action, « Nouveau modèle »', () => {
  it('creates a template and answers its id, for the dialog to open it, or says why not', async () => {
    const created = await action({
      request: formRequest(URL, { intent: 'create-template', name: 'Zoom' }),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)
    const refused = await action({
      request: formRequest(URL, { intent: 'create-template', name: '' }),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)
    expect(created).toEqual({ ok: true, id: 12 })
    expect(refused).toMatchObject({ init: { status: 400 }, data: { ok: false, errors: ['Donnez-lui un nom.'] } })
  })

  it.each(OTHER_RIGHTS.map(rights => [rights] as const))('refuses to create one for anyone else (%s)', async rights => {
    const response = await respond(() =>
      action({
        request: formRequest(URL, { intent: 'create-template', name: 'Zoom' }),
        params: {},
        context: routeContext(rights),
      } as never),
    )
    expect(response.headers.get('Location')).toBe('/settings')
    expect(saved).toEqual([])
  })
})

describe('schedule-templates action, a reorder', () => {
  it('answers ok without a toast: the list shows the move and the page says it', async () => {
    outcome.current = 'reordered'
    const { okWithToast } = await import('./_toast.server')
    vi.mocked(okWithToast).mockClear()
    const result = await action({
      request: formRequest(`${URL}?template=3`, { intent: 'reorder-parts', orderedIds: '[1]' }),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)
    expect(result).toMatchObject({ data: { ok: true } })
    expect(okWithToast).not.toHaveBeenCalled()
  })
})

describe('schedule-templates loader, the open template', () => {
  it('reads the items of the template the address names, and none without one', async () => {
    const open = await loader({
      request: new Request(`${URL}?template=3`),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)
    const closed = await loader({
      request: new Request(URL),
      params: {},
      context: routeContext([Permission.CanManageProgramTemplates]),
    } as never)
    expect(itemsAsked).toEqual([3])
    expect(open.items).toMatchObject({ kindId: 270 })
    expect(closed.items).toBeNull()
  })
})

describe('schedule-templates shouldRevalidate', () => {
  const at = (search: string) => new globalThis.URL(`${URL}${search}`)
  const base = { defaultShouldRevalidate: false, currentParams: {}, nextParams: {} }

  it('reads the page again after a refused submission, whatever data it missed', () => {
    expect(
      shouldRevalidate({
        ...base,
        currentUrl: at('?template=3&item=part-1'),
        nextUrl: at('?template=3&item=part-1'),
        formMethod: 'POST',
        actionStatus: 400,
      } as never),
    ).toBe(true)
  })

  it('does not read it again for a move inside the open template', () => {
    expect(
      shouldRevalidate({
        ...base,
        currentUrl: at('?template=3'),
        nextUrl: at('?template=3&item=part-1'),
      } as never),
    ).toBe(false)
  })
})
