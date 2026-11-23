import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

// What the programmes list receives: drafts only for whoever may act on them, each programme's actions by the rights
// that route checks, the assignments to review only for whoever may reassign them and only before the programme, and
// no template ids.

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

const programme = (
  id: number,
  templateId: number | null,
  status: 'draft' | 'released',
  day: string,
  flagged: { parts: number; services: number },
) => ({
  id,
  name: `Programme ${id}`,
  startDate: new Date(`${day}T18:00:00Z`),
  endDate: new Date(`${day}T19:45:00Z`),
  status,
  templateId,
  kind: templateId == null ? null : { name: `Modèle ${templateId}`, color: '#3b82f6' },
  parts: { total: 7, filled: 5, flagged: flagged.parts },
  services: { total: 4, filled: 3, flagged: flagged.services },
  awaitingProgramme: id === 34,
})

vi.mock('~/features/events/server/programme-list.queries', () => ({
  congregationHasProgrammes: () => Promise.resolve(true),
  listProgrammes: () =>
    Promise.resolve([
      // Already held: nothing left to review on it.
      programme(30, 4, 'released', '2026-11-05', { parts: 1, services: 0 }),
      programme(31, 4, 'released', '2026-11-12', { parts: 1, services: 1 }),
      programme(32, 5, 'draft', '2026-11-15', { parts: 1, services: 2 }),
      programme(33, null, 'draft', '2026-11-19', { parts: 0, services: 0 }),
      // Created ahead by the recurring-events job, its programme still to come.
      programme(34, 4, 'draft', '2026-11-26', { parts: 0, services: 0 }),
    ]),
}))

// The rules by schedule are scheduleRightsFor's own integration test: faked here as they answer, from the kinds whose
// programme and whose duties the reader answers for (changing any event of those kinds, D28; publishing one only when
// both are theirs, D49) and the events they may delete (D50), to check what the page makes of them.
const responsibleFor = vi.hoisted(() => ({
  programme: [] as number[],
  service: [] as number[],
  deletes: [] as number[],
}))
vi.mock('~/features/events/server/schedule-rights.server', () => ({
  scheduleRightsFor: (
    _db: unknown,
    can: (permission: string) => boolean,
    _userId: number,
    events: { id: number; templateId: number | null }[],
  ) => {
    const kindIds = [...new Set([...responsibleFor.programme, ...responsibleFor.service])]
    const answers = (kinds: number[], templateId: number | null) => templateId != null && kinds.includes(templateId)
    const manages = can('can-manage-programs')
    const fills = manages || can('can-assign-program-parts')
    const rightsOf = new Map(
      events.map(({ id, templateId }) => {
        const programme = answers(responsibleFor.programme, templateId)
        const services = answers(responsibleFor.service, templateId)
        return [
          id,
          {
            canEdit: manages || answers(kindIds, templateId),
            canDelete: manages || responsibleFor.deletes.includes(id),
            canPublish: can('can-publish-programs') || (programme && services),
            canAssignParts: fills || programme,
            canAssignServices: fills || services,
          },
        ]
      }),
    )
    return Promise.resolve({ rightsOf, kindIds })
  },
}))

const { loader } = await import('./list')

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-09T10:00:00Z'))
})
afterAll(() => vi.useRealTimers())

async function load(
  permissions: Permission[],
  responsible: { programme?: number[]; service?: number[]; deletes?: number[] } = {},
) {
  responsibleFor.programme = responsible.programme ?? []
  responsibleFor.service = responsible.service ?? []
  responsibleFor.deletes = responsible.deletes ?? []
  const context = {
    get: (key: symbol) => {
      if (key === permissionsContext) return new Set([Permission.CanViewPrograms, ...permissions])
      if (key === congregationContext) return { timezone: 'Europe/Paris' }
      return { id: 1, congregationId: 1, firstname: 'Marc' }
    },
  }
  const request = new Request('http://localhost/programs')
  return (await loader({ request, context, params: {} } as never)) as Exclude<
    Awaited<ReturnType<typeof loader>>,
    Response
  >
}

const rows = (data: Awaited<ReturnType<typeof load>>) =>
  data.programmes.map(row => [
    row.id,
    { edit: row.canEdit, delete: row.canDelete, publish: row.canPublish, review: row.review },
  ])

describe('/programs — what the list receives', () => {
  it('shows a reader of programmes the published ones only, with nothing to act on', async () => {
    const data = await load([])

    expect(rows(data)).toEqual([
      [30, { edit: false, delete: false, publish: false, review: 0 }],
      [31, { edit: false, delete: false, publish: false, review: 0 }],
    ])
    expect(data.canCreate).toBe(false)
  })

  it('gives the programme manager every programme and what to review on those still ahead', async () => {
    const data = await load([
      Permission.CanManagePrograms,
      Permission.CanPublishPrograms,
      Permission.CanAssignProgramParts,
    ])

    expect(rows(data)).toEqual([
      [30, { edit: true, delete: true, publish: true, review: 0 }],
      [31, { edit: true, delete: true, publish: true, review: 2 }],
      [32, { edit: true, delete: true, publish: true, review: 3 }],
      [33, { edit: true, delete: true, publish: true, review: 0 }],
      [34, { edit: true, delete: true, publish: true, review: 0 }],
    ])
    expect(data.canCreate).toBe(true)
    expect(data.programmes.filter(row => row.awaitingProgramme).map(row => row.id)).toEqual([34])
  })

  it('gives a responsible every programme of their kinds to change, and the services to review on those where only the duties are theirs', async () => {
    // Programme 34 holds their schedules alone; the others someone else's too (D50).
    const data = await load([], { programme: [4], service: [4, 5], deletes: [34] })

    expect(rows(data)).toEqual([
      [30, { edit: true, delete: false, publish: true, review: 0 }],
      [31, { edit: true, delete: false, publish: true, review: 2 }],
      [32, { edit: true, delete: false, publish: false, review: 2 }],
      [34, { edit: true, delete: true, publish: true, review: 0 }],
    ])
    expect(data.canCreate).toBe(true)
  })

  it('lets someone who may only publish select every programme to publish it, with nothing to review', async () => {
    const data = await load([Permission.CanPublishPrograms])

    expect(rows(data).map(([id, row]) => [id, row])).toEqual([
      [30, { edit: false, delete: false, publish: true, review: 0 }],
      [31, { edit: false, delete: false, publish: true, review: 0 }],
      [32, { edit: false, delete: false, publish: true, review: 0 }],
      [33, { edit: false, delete: false, publish: true, review: 0 }],
      [34, { edit: false, delete: false, publish: true, review: 0 }],
    ])
    expect(data.canCreate).toBe(false)
  })

  it('sends no template id to the page', async () => {
    const data = await load([Permission.CanManagePrograms])

    expect(JSON.stringify(data)).not.toContain('templateId')
    expect(data.programmes[0]).toMatchObject({
      kind: { name: 'Modèle 4', color: '#3b82f6' },
      parts: { total: 7, filled: 5 },
    })
  })

  it('runs from today to the end of next month by default', async () => {
    const data = await load([])

    expect(data.period).toEqual({ from: '2026-11-09', to: '2026-12-31' })
  })
})
