import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

// What the event page sends: a draft schedule's items only to whoever may act on it, published ones to every reader
// (spec §5.3, D45). The rights are faked (their integration test owns them) to check what the page makes of them.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')
const congregationContext = Symbol('congregationContext')

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  currentAccountContext,
  permissionsContext,
  congregationContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) =>
    fn({ member: { findMany: () => Promise.resolve([]) } }),
}))

vi.mock('~/shared/infra/logger.server', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { default: logger, createLogger: () => logger }
})

const state = vi.hoisted(() => ({
  rights: { change: false, publish: false, part: false, service: false },
  statuses: { programme: 'draft', duty: 'published' },
}))

vi.mock('~/features/events/server/event-part-assignments.server', () => ({
  getEventProgramme: () =>
    Promise.resolve({
      id: 40,
      name: 'Réunion',
      status: 'released',
      templateId: 3,
      template: null,
      schedules: [
        { kind: 'programme', status: state.statuses.programme },
        { kind: 'duty', status: state.statuses.duty },
      ],
      eventParts: [{ id: 1, name: 'Discours' }],
      eventServiceParts: [{ id: 2, name: 'Sono' }],
    }),
}))

vi.mock('~/features/events/server/schedule-rights.server', () => ({
  canChangeEvent: () => Promise.resolve(state.rights.change),
  canDeleteEvent: () => Promise.resolve(false),
  canPublishEvent: () => Promise.resolve(state.rights.publish),
  canFillSchedule: (_db: unknown, _can: unknown, _user: number, _event: unknown, kind: 'part' | 'service') =>
    Promise.resolve(kind === 'part' ? state.rights.part : state.rights.service),
}))

vi.mock('~/features/events/server/attendance.queries', () => ({ eventHasAttendance: () => Promise.resolve(false) }))
vi.mock('~/features/events/server/assignment-candidates.server', () => ({
  buildAssignmentCandidates: () => Promise.resolve({ partCandidates: {}, serviceCandidates: {} }),
}))
vi.mock('~/features/events/server/external-speakers.queries', () => ({
  listExternalSpeakerOptions: () => Promise.resolve([]),
}))
vi.mock('~/features/events/server/build-share-message.server', () => ({
  buildShareTextsForEvent: () => Promise.resolve({}),
}))
vi.mock('~/features/display-board/index.server', () => ({ resolveProgrammeLink: () => Promise.resolve('/board') }))

const { loader } = await import('./view')

async function load() {
  const context = {
    get: (key: symbol) => {
      if (key === permissionsContext) return new Set([Permission.CanViewPrograms])
      if (key === congregationContext) return { timezone: 'Europe/Paris', locale: 'fr' }
      return { id: 1, congregationId: 1 }
    },
  }
  const data = (await loader({ params: { eventId: '40' }, context } as never)) as {
    event: { eventParts: { id: number }[]; eventServiceParts: { id: number }[]; schedules: { kind: string }[] }
  }
  return {
    parts: data.event.eventParts.map(p => p.id),
    services: data.event.eventServiceParts.map(s => s.id),
    schedules: data.event.schedules.map(schedule => schedule.kind),
  }
}

beforeEach(() => {
  state.rights = { change: false, publish: false, part: false, service: false }
  state.statuses = { programme: 'draft', duty: 'published' }
})

describe('the event page’s schedules', () => {
  it('sends a reader the published duties and nothing of the draft programme', async () => {
    expect(await load()).toEqual({ parts: [], services: [2], schedules: ['duty'] })
  })

  it('sends a reader everything once both are published', async () => {
    state.statuses.programme = 'published'
    expect(await load()).toMatchObject({ parts: [1], services: [2] })
  })

  it('sends the draft programme to whoever fills it, and the draft duties only to whoever fills those', async () => {
    state.statuses.duty = 'draft'
    state.rights.part = true
    expect(await load()).toEqual({ parts: [1], services: [], schedules: ['programme'] })
    state.rights = { change: false, publish: false, part: false, service: true }
    expect(await load()).toEqual({ parts: [], services: [2], schedules: ['duty'] })
  })

  it('sends every draft to whoever may change or publish the event', async () => {
    state.statuses.duty = 'draft'
    state.rights.change = true
    expect(await load()).toMatchObject({ parts: [1], services: [2] })
    state.rights = { change: false, publish: true, part: false, service: false }
    expect(await load()).toMatchObject({ parts: [1], services: [2] })
  })
})
