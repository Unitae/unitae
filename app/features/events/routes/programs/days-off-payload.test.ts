import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

// What the absences page receives: each assignment falling during an absence links to « Réattribuer » only for whoever
// the event's page lets fill that slot, to the event alone for its other readers, and nowhere for a reader of absences
// who cannot open the programmes. Template ids stay on the server.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')
const congregationContext = Symbol('congregationContext')

vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  congregationContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn({}),
}))

vi.mock('~/shared/infra/logger.server', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { default: logger, createLogger: () => logger }
})

const asked = vi.hoisted(() => ({ from: null as Date | null, to: null as Date | null }))

vi.mock('~/features/events/server/days-off.queries', () => ({
  congregationHasAbsences: () => Promise.resolve(true),
  listCongregationAbsences: (_db: unknown, { from, to }: { from: Date; to: Date }) => {
    asked.from = from
    asked.to = to
    const slot = (kind: 'part' | 'service', id: number, templateId: number | null) => ({
      kind,
      id,
      name: `${kind} ${id}`,
      eventId: 30 + id,
      eventDate: new Date('2026-11-12T18:00:00Z'),
      templateId,
      // Part 13 falls in a draft.
      published: id !== 13,
    })
    return Promise.resolve([
      {
        id: 1,
        startDate: new Date('2026-11-09T23:00:00Z'),
        endDate: new Date('2026-11-13T22:59:59.999Z'),
        declaredAt: new Date('2026-11-02T10:00:00Z'),
        memberId: 5,
        firstname: 'Élodie',
        lastname: 'Martin',
        conflicts: [slot('part', 12, 4), slot('part', 13, 5), slot('service', 7, 5), slot('part', 14, null)],
      },
      {
        id: 2,
        startDate: new Date('2026-11-27T23:00:00Z'),
        endDate: new Date('2026-11-28T22:59:59.999Z'),
        declaredAt: new Date('2026-11-02T10:00:00Z'),
        memberId: null,
        firstname: 'Compte',
        lastname: 'Admin',
        conflicts: [],
      },
    ])
  },
}))

// The reader runs the whole programme of template 4, and only the services of template 5.
vi.mock('~/features/events/server/events-auth.server', () => ({
  getResponsibleTemplateIds: (_db: unknown, _userId: number, _congregationId: number, scope: string) =>
    Promise.resolve(scope === 'service' ? [4, 5] : [4]),
}))

const { loader } = await import('./days-off')

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-09T10:00:00Z'))
})
afterAll(() => vi.useRealTimers())

async function load(permissions: Permission[], search = '') {
  const context = {
    get: (key: symbol) => {
      if (key === permissionsContext) return new Set([Permission.CanViewAbsences, ...permissions])
      if (key === congregationContext) return { timezone: 'Europe/Paris' }
      return { id: 1, congregationId: 1, firstname: 'Marc' }
    },
  }
  const request = new Request(`http://localhost/programs/days-off${search}`)
  return (await loader({ request, context, params: {} } as never)) as Exclude<
    Awaited<ReturnType<typeof loader>>,
    Response
  >
}

const links = (data: Awaited<ReturnType<typeof load>>) =>
  data.absences[0].conflicts.map(conflict => [conflict.key, conflict.action, conflict.href])

describe('/programs/days-off — what the page receives', () => {
  it('offers « Réattribuer » on the slots the reader may fill, and the event alone on the others', async () => {
    const data = await load([Permission.CanViewPrograms])

    expect(links(data)).toEqual([
      ['part-12', 'reassign', '/programs/events/42?assign=part-12'],
      ['part-13', 'view', '/programs/events/43'],
      ['service-7', 'reassign', '/programs/events/37?assign=service-7'],
      ['part-14', 'view', '/programs/events/44'],
    ])
  })

  // Red once the programme is published and people rely on it, orange while it is a draft.
  it('tells the page which assignments fall in a published programme', async () => {
    const data = await load([Permission.CanViewPrograms])

    expect(data.absences[0].conflicts.map(conflict => [conflict.key, conflict.published])).toEqual([
      ['part-12', true],
      ['part-13', false],
      ['service-7', true],
      ['part-14', true],
    ])
  })

  it('lets the holder of the right to assign reassign every slot', async () => {
    const data = await load([Permission.CanViewPrograms, Permission.CanAssignProgramParts])

    expect(data.absences[0].conflicts.every(conflict => conflict.action === 'reassign')).toBe(true)
  })

  it('gives a reader of absences alone no link to the programmes, nor to the records', async () => {
    const data = await load([])

    expect(data.absences[0].conflicts.map(conflict => conflict.href)).toEqual([null, null, null, null])
    expect(data.absences.map(absence => absence.recordHref)).toEqual([null, null])
  })

  it('links the person to their record for readers of the publishers, when the absence has one', async () => {
    const data = await load([Permission.CanViewPublishers])

    expect(data.absences.map(absence => [absence.name, absence.recordHref])).toEqual([
      ['Élodie MARTIN', '/publishers/5/view'],
      ['Compte ADMIN', null],
    ])
  })

  it('sends no template id to the page', async () => {
    const data = await load([Permission.CanViewPrograms])

    expect(JSON.stringify(data)).not.toContain('templateId')
  })

  // Absences cover whole days in the congregation's zone: the period does too, its last day to the evening.
  it('reads the period as whole days in the congregation zone', async () => {
    const data = await load([], '?from=2026-11-16&to=2026-11-22')

    expect(data.period).toEqual({ from: '2026-11-16', to: '2026-11-22' })
    expect(asked.from).toEqual(new Date('2026-11-15T23:00:00Z'))
    expect(asked.to).toEqual(new Date('2026-11-22T22:59:59.999Z'))
  })

  it('runs from today to the end of next month by default', async () => {
    const data = await load([])

    expect(data.period).toEqual({ from: '2026-11-09', to: '2026-12-31' })
    expect(data.preset).toBe('next-month')
  })
})
