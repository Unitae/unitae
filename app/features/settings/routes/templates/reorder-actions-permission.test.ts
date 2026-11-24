import { beforeEach, describe, expect, it, vi } from 'vitest'

// Dragging a part or a service on a template page posts its new order. The action checks the template right (a
// template's responsible no longer writes here since 6a-1c) and never touches a system template. Reorders
// land in an in-memory list, so the tests assert on whether one was written.

const { state } = vi.hoisted(() => ({
  state: {
    templateKey: 'midweek-meeting',
    written: [] as { kind: 'parts' | 'services'; templateId: number; orderedIds: number[] }[],
  },
}))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) =>
    fn({ eventTemplate: { findFirst: () => Promise.resolve({ key: state.templateKey }) } }),
}))

vi.mock('~/features/events/index.server', () => ({
  reorderTemplateParts: (_db: unknown, _cong: number, templateId: number, orderedIds: number[]) => {
    state.written.push({ kind: 'parts', templateId, orderedIds })
    return Promise.resolve(true)
  },
  reorderTemplateServices: (_db: unknown, _cong: number, templateId: number, orderedIds: number[]) => {
    state.written.push({ kind: 'services', templateId, orderedIds })
    return Promise.resolve(true)
  },
}))

const { Permission } = await import('~/shared/types/permission')
const { respond, routeContext } = await import('~/tests/helpers/route-action')
const reorderParts = await import('./reorder-parts')
const reorderServices = await import('./reorder-services')

type Action = typeof reorderServices.action
type Granted = (typeof Permission)[keyof typeof Permission]

function post(action: Action, permissions: Granted[], body: unknown) {
  return action({
    request: new Request('https://unitae.example.test/settings/templates/3/reorder', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    params: { templateId: '3' },
    context: routeContext(permissions),
  } as never)
}

beforeEach(() => {
  state.templateKey = 'midweek-meeting'
  state.written = []
})

describe.each([
  { kind: 'parts' as const, action: reorderParts.action as unknown as Action },
  { kind: 'services' as const, action: reorderServices.action as Action },
])('the template’s reorder-$kind action', ({ kind, action }) => {
  it('writes the order for a caller who manages templates', async () => {
    const result = await post(action, [Permission.CanManageProgramTemplates], { orderedIds: [2, 1] })

    expect(result).toEqual({ ok: true })
    expect(state.written).toEqual([{ kind, templateId: 3, orderedIds: [2, 1] }])
  })

  it('refuses a caller without the right, programme readers and managers included', async () => {
    const response = await respond(() =>
      post(action, [Permission.CanViewPrograms, Permission.CanManagePrograms], { orderedIds: [2, 1] }),
    )

    expect(response.headers.get('Location')).toBe('/settings/templates')
    expect(state.written).toEqual([])
  })

  it('never reorders a system template', async () => {
    state.templateKey = 'freeform'

    expect(await post(action, [Permission.CanManageProgramTemplates], { orderedIds: [2, 1] })).toEqual({ ok: false })
    expect(state.written).toEqual([])
  })

  it('answers no, writing nothing, to an empty or malformed list', async () => {
    const empty = await post(action, [Permission.CanManageProgramTemplates], { orderedIds: [] })
    const notAList = await post(action, [Permission.CanManageProgramTemplates], { ids: [2, 1] })

    expect([empty, notAList]).toEqual([{ ok: false }, { ok: false }])
    expect(state.written).toEqual([])
  })
})
