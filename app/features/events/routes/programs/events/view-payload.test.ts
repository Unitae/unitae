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
  /** The schedules the reader may publish, and the programme's parts (none: a programme still to give). */
  mine: [2] as number[],
  parts: [{ id: 1, name: 'Discours' }] as { id: number; name: string }[],
  services: [{ id: 2, name: 'Sono' }] as { id: number; name: string }[],
}))

vi.mock('~/features/events/server/event-part-assignments.server', () => ({
  getEventProgramme: () =>
    Promise.resolve({
      id: 40,
      name: 'Réunion',
      status: 'released',
      templateId: 3,
      // A kind with parts to give: an empty programme waits for its own (programmeAwaits).
      template: { key: 'midweek-meeting', _count: { parts: 3, serviceParts: 1 } },
      schedules: [
        {
          id: 1,
          kind: 'programme',
          status: state.statuses.programme,
          name: null,
          key: 'programme',
          scheduleTemplate: null,
        },
        {
          id: 2,
          kind: 'duty',
          status: state.statuses.duty,
          name: 'Services',
          key: null,
          scheduleTemplate: { responsibleRoleId: 9 },
        },
      ],
      eventParts: state.parts,
      eventServiceParts: state.services,
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
// What « Tout publier » / « Tout retirer » offer is publishActionsFor's integration test; the page hands it on as is.
vi.mock('~/features/events/server/event-publishing.server', () => ({
  publishActionsFor: (_db: unknown, _can: unknown, _user: number, events: { id: number }[]) =>
    Promise.resolve(new Map(events.map(({ id }) => [id, { canRelease: true, canUnrelease: false }]))),
  // The duties (schedule 2) are the reader's to publish.
  publishableScheduleIds: () => Promise.resolve(new Set(state.mine)),
}))
vi.mock('~/shared/auth/permissions.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/permissions.server')>()),
  resolveEffectiveRoleIds: () => Promise.resolve([9]),
}))
// Who may rename or delete which is changeableScheduleIds' integration test: none here.
vi.mock('~/features/events/server/schedule-changes.server', () => ({
  changeableScheduleIds: () => Promise.resolve(new Set<number>()),
}))
// Who answers for each schedule is listScheduleResponsibles' integration test.
vi.mock('~/features/events/server/schedule-responsibles.queries', () => ({
  listScheduleResponsibles: (_db: unknown, roleIds: number[]) =>
    Promise.resolve(
      new Map(roleIds.map(roleId => [roleId, { role: { key: 'services', name: 'Services' }, holders: [] }])),
    ),
}))

const { loader } = await import('./view')

function readerContext() {
  return {
    get: (key: symbol) => {
      if (key === permissionsContext) return new Set([Permission.CanViewPrograms])
      if (key === congregationContext) return { timezone: 'Europe/Paris', locale: 'fr' }
      return { id: 1, congregationId: 1 }
    },
  }
}

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
  state.mine = [2]
  state.parts = [{ id: 1, name: 'Discours' }]
  state.services = [{ id: 2, name: 'Sono' }]
})

describe('the event page’s publishing', () => {
  it('offers what publishActionsFor offers for the reader’s schedules', async () => {
    const data = (await loader({ params: { eventId: '40' }, context: readerContext() } as never)) as {
      canRelease: boolean
      canUnrelease: boolean
    }
    expect({ release: data.canRelease, unrelease: data.canUnrelease }).toEqual({ release: true, unrelease: false })
  })
})

describe('each schedule’s section', () => {
  it('carries its responsible, whether the reader may publish it, and « Tout publier »’s count', async () => {
    const data = (await loader({ params: { eventId: '40' }, context: readerContext() } as never)) as {
      event: { schedules: unknown[] }
      publishAll: unknown
    }
    expect(data.event.schedules).toEqual([
      {
        id: 2,
        kind: 'duty',
        status: 'published',
        name: 'Services',
        responsible: { role: { key: 'services', name: 'Services' }, holders: [], youHoldIt: true },
        mayPublish: true,
        publishable: false,
        mayChange: false,
      },
    ])
    // Its one schedule of theirs is published: nothing left for them to publish.
    expect(data.publishAll).toEqual({ count: 0, everyone: false })
  })
})

describe('what the page offers to publish', () => {
  it('never offers a programme still to give, nor counts it in « Tout publier »', async () => {
    state.statuses = { programme: 'draft', duty: 'draft' }
    state.mine = [1, 2]
    state.parts = []
    state.rights.change = true
    const data = (await loader({ params: { eventId: '40' }, context: readerContext() } as never)) as {
      event: { schedules: { id: number; publishable: boolean }[] }
      publishAll: { count: number }
    }
    expect(data.event.schedules.map(schedule => [schedule.id, schedule.publishable])).toEqual([
      [1, false],
      [2, true],
    ])
    expect(data.publishAll.count).toBe(1)
  })
})

describe('what the page offers to publish, case by case', () => {
  const load2 = async () =>
    (await loader({ params: { eventId: '40' }, context: readerContext() } as never)) as {
      event: { schedules: { id: number; mayPublish: boolean; publishable: boolean; responsible: unknown }[] }
      publishAll: { count: number; everyone: boolean }
      awaitingProgramme: boolean
    }

  it('offers no publishing at all while the meeting awaits its programme', async () => {
    state.statuses = { programme: 'draft', duty: 'draft' }
    state.mine = [1, 2]
    state.parts = []
    state.services = []
    state.rights.change = true
    const data = await load2()
    expect(data.awaitingProgramme).toBe(true)
    expect(data.event.schedules.map(schedule => schedule.publishable)).toEqual([false, false])
    expect(data.publishAll.count).toBe(0)
  })

  it('says « Tout publier » for « Publier », and nothing to publish on someone else’s or a published schedule', async () => {
    state.rights.change = true
    const data = await load2()
    // The programme is not theirs; their duties are published already.
    expect(data.event.schedules.map(schedule => [schedule.id, schedule.mayPublish, schedule.publishable])).toEqual([
      [1, false, false],
      [2, true, false],
    ])
    expect(data.event.schedules[0]?.responsible).toBeNull()
    expect(data.publishAll).toEqual({ count: 0, everyone: false })
  })
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
