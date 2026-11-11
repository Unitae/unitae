import { beforeEach, describe, expect, it, vi } from 'vitest'

// The organigram page's changes: each intent reaches its service with the actor's rights, answers with a toast, and a
// refusal comes back as words — with, for a deletion, what the role still alone reserves.

vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn(async () => {
    const flashed: string[] = []
    return { flashed, flash: (_kind: string, message: string) => flashed.push(message) }
  }),
  commitSession: vi.fn(async (session: { flashed: string[] }) => `flash=${session.flashed.join('|')}`),
}))

const calls = vi.hoisted(() => ({ list: [] as unknown[][] }))
const record =
  (name: string, result: unknown = undefined) =>
  async (...args: unknown[]) => {
    calls.list.push([name, ...args.slice(1)])
    return result
  }
vi.mock('~/shared/domain/organigram.server', () => ({
  addRoleToOrganigram: vi.fn(record('add')),
  createServiceInOrganigram: vi.fn(record('createInChart', 77)),
  moveOrganigramNode: vi.fn(record('move')),
  removeRoleFromOrganigram: vi.fn(record('remove')),
  setOrganigramParent: vi.fn(record('setParent')),
  setRoleSinglePerson: vi.fn(record('single')),
}))
vi.mock('~/shared/domain/organigram-seats.server', () => ({
  seatMember: vi.fn(record('seat')),
  unseatMember: vi.fn(record('unseat')),
}))
vi.mock('~/shared/domain/organigram-adoption.server', () => ({ adoptServiceCommittee: vi.fn(record('adopt')) }))
vi.mock('~/shared/domain/roles.server', () => ({
  createRole: vi.fn(record('createOff', { id: 78 })),
  deleteRole: vi.fn(record('delete')),
  updateRoleIdentity: vi.fn(record('identity')),
}))

const { runOrganigramAction, organigramRefusal, reservationLines } = await import('./_organigram-action.server')
const { RoleReservesError } = await import('~/shared/domain/role-reservations.server')
const { GrantBeyondActorError } = await import('~/shared/domain/role-grant-limits.server')
const { ValidationError } = await import('~/shared/errors/app-error.server')

const db = {
  role: { findFirst: vi.fn(async () => ({ key: 'sono', name: 'Sono', isSinglePerson: false })) },
  member: { findFirst: vi.fn(async () => ({ firstname: 'Zoé', lastname: 'Martin' })) },
} as never
const ACTOR = { id: 1, congregationId: 10, permissions: new Set(['can-manage-roles']) }
const request = new Request('https://unitae.example.test/congregation/roles/organigram', { method: 'POST' })

function form(fields: Record<string, string | string[]>): FormData {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    for (const each of Array.isArray(value) ? value : [value]) formData.append(name, each)
  }
  return formData
}

const run = (fields: Record<string, string | string[]>) => runOrganigramAction(request, db, form(fields), ACTOR)
const toastOf = (result: unknown) => new Headers((result as { init?: ResponseInit }).init?.headers).get('Set-Cookie')

beforeEach(() => {
  calls.list.length = 0
})

describe('runOrganigramAction', () => {
  it('seats a person and says who now sits where', async () => {
    const result = await run({ intent: 'seat', roleId: '3', memberId: '501', kind: 'deputy' })
    expect(calls.list[0]).toEqual([
      'seat',
      { intent: 'seat', roleId: 3, memberId: 501, kind: 'deputy' },
      10,
      1,
      ACTOR.permissions,
    ])
    expect(toastOf(result)).toBe('flash=Zoé MARTIN : Adjoint de Sono')
  })

  it('creates a role under another and hands back its id, so its panel opens', async () => {
    const result = await run({ intent: 'create', name: 'Cartes', parentRoleId: '3', description: 'Les plans' })
    expect(calls.list[0]?.[0]).toBe('createInChart')
    expect((result as { data: unknown }).data).toEqual({ ok: true, roleId: 77 })
  })

  it('creates a role outside the chart when no place is chosen', async () => {
    const result = await run({ intent: 'create', name: 'Lecteurs', parentRoleId: '' })
    expect(calls.list[0]?.[0]).toBe('createOff')
    expect((result as { data: unknown }).data).toEqual({ ok: true, roleId: 78 })
  })

  it('saves a role’s name, description, note and type together', async () => {
    await run({
      intent: 'update',
      roleId: '3',
      name: 'Sono',
      description: '',
      note: 'Chaque réunion',
      singlePerson: 'on',
    })
    expect(calls.list.map(call => call[0])).toEqual(['identity', 'single'])
    expect(calls.list[0]?.[4]).toEqual({ name: 'Sono', description: null, organigramNote: 'Chaque réunion' })
  })

  it('takes over the committee from the post and role pairs, an empty choice starting the post empty', async () => {
    await run({ intent: 'adopt', postKey: ['coordinator', 'secretary'], fromRoleId: ['21', ''] })
    expect(calls.list[0]?.[1]).toEqual([
      { postKey: 'coordinator', fromRoleId: 21 },
      { postKey: 'secretary', fromRoleId: null },
    ])
  })

  it('refuses a form it cannot read', async () => {
    const result = await run({ intent: 'create', name: '' })
    expect((result as { data: { ok: boolean } }).data.ok).toBe(false)
    expect(calls.list).toEqual([])
  })
})

describe('organigramRefusal', () => {
  it('names what a role still alone reserves', () => {
    const reservations = { sections: ['Comptes rendus'], territoryKinds: [], templateSlots: [], programmeSlots: 0 }
    const result = organigramRefusal(new RoleReservesError(reservations))
    expect(result.data).toMatchObject({ ok: false, reserves: ['la section « Comptes rendus » du tableau d’affichage'] })
    expect(result.init?.status).toBe(409)
  })

  it('words every kind of place, a built-in territory kind by its label', () => {
    const lines = reservationLines({
      sections: [],
      territoryKinds: [
        { key: 'phone', name: null },
        { key: 'custom-1', name: 'Marchés' },
      ],
      templateSlots: [{ template: 'Week-end', name: 'Lecteur' }],
      programmeSlots: 3,
    })
    expect(lines).toEqual([
      'le type de territoire « Téléphone »',
      'le type de territoire « Marchés »',
      '« Lecteur » du modèle « Week-end »',
      '3 parties de programmes à venir',
    ])
  })

  it('turns a rule the person broke into words, and rights they lack into a refusal', () => {
    expect(organigramRefusal(new ValidationError('memberId', 'Pas ancien')).data).toEqual({
      ok: false,
      error: 'Pas ancien',
    })
    expect(organigramRefusal(new GrantBeyondActorError('no')).init?.status).toBe(403)
  })

  it('lets anything else through as an error', () => {
    expect(() => organigramRefusal(new Error('database down'))).toThrow('database down')
  })
})
