import { beforeEach, describe, expect, it, vi } from 'vitest'

// Dragging a part or a service on a template page posts its new order. The action checks what the page's handles
// promise — the template right, or being the template's responsible — and never touches a system template. Reorders
// land in an in-memory list, so the tests assert on whether one was written.

const { state } = vi.hoisted(() => ({
  state: {
    responsible: false,
    templateKey: 'midweek-meeting',
    written: [] as { kind: 'parts' | 'services'; templateId: number; orderedIds: number[] }[],
    asked: [] as number[],
  },
}))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) =>
    fn({ eventTemplate: { findFirst: () => Promise.resolve({ key: state.templateKey }) } }),
}))

vi.mock('~/features/events/index.server', () => ({
  // The write routes ask with the default programme scope: a duties-only responsible never writes the parts or services.
  isTemplateResponsible: (...args: unknown[]) => {
    state.asked.push(args.length)
    return Promise.resolve(state.responsible ? { id: 1 } : null)
  },
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
  state.responsible = false
  state.templateKey = 'midweek-meeting'
  state.written = []
  state.asked = []
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

  it('writes the order for the template’s responsible, without the right', async () => {
    state.responsible = true

    expect(await post(action, [], { orderedIds: [2, 1] })).toEqual({ ok: true })
    expect(state.written).toHaveLength(1)
    // Asked with the default programme scope (no fifth argument): a duties-only responsible does not write here.
    expect(state.asked).toEqual([4])
  })

  it('refuses a caller with neither', async () => {
    const response = await respond(() => post(action, [], { orderedIds: [2, 1] }))

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
