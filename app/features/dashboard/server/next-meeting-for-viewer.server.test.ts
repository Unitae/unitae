import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Permission } from '~/shared/types/permission'

vi.mock('./dashboard.server', () => ({ getNextMeeting: vi.fn() }))
vi.mock('./programme-board-visibility.server', () => ({ isProgrammeOnBoardFor: vi.fn() }))
vi.mock('~/features/events/server/events-auth.server', () => ({ canEditEvent: vi.fn() }))

const { nextMeetingForViewer } = await import('./next-meeting-for-viewer.server')
const { getNextMeeting } = await import('./dashboard.server')
const { isProgrammeOnBoardFor } = await import('./programme-board-visibility.server')
const { canEditEvent } = await import('~/features/events/server/events-auth.server')

const db = {} as never
const meeting = {
  id: 55,
  templateId: 9,
  name: 'Réunion de semaine',
  link: '/board/dynamic/3/viewer?eventId=55',
  eventParts: [
    { id: 10, name: 'Discours', hasConflict: false },
    { id: 11, name: 'Étude', hasConflict: true },
  ],
  eventServiceParts: [],
  userPartIds: [10],
  userServicePartIds: [],
}

function viewer(permissions: Permission[], audience: 'programmes' | 'board' | null) {
  return { accountId: 3, memberId: 42, congregationId: 1, permissions: new Set(permissions), audience }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getNextMeeting).mockResolvedValue(meeting as never)
  vi.mocked(canEditEvent).mockResolvedValue(false)
  vi.mocked(isProgrammeOnBoardFor).mockResolvedValue(false)
})

describe('nextMeetingForViewer', () => {
  it('shows a board reader the schedule they can read on the board, without absence flags', async () => {
    vi.mocked(isProgrammeOnBoardFor).mockResolvedValue(true)
    const result = await nextMeetingForViewer(db, viewer([Permission.CanViewBoard], 'board'))
    expect(result?.showCard).toBe(true)
    expect(result?.canAct).toBe(false)
    expect(result?.link).toBe('/board/dynamic/3/viewer?eventId=55')
    expect(result?.meeting.eventParts.map(p => [p.id, p.hasConflict])).toEqual([
      [10, false],
      [11, false],
    ])
  })

  it('keeps the schedule from a board reader whose board does not show this programme', async () => {
    const result = await nextMeetingForViewer(db, viewer([Permission.CanViewBoard], 'board'))
    expect(result?.showCard).toBe(false)
    expect(result?.meeting.eventParts.map(p => p.id)).toEqual([10])
  })

  it('shows a programme reader the schedule, linked to the programme page, without absence flags', async () => {
    const result = await nextMeetingForViewer(db, viewer([Permission.CanViewPrograms], 'programmes'))
    expect(result?.showCard).toBe(true)
    expect(result?.link).toBe('/programs/events/55')
    expect(result?.meeting.eventParts.some(p => p.hasConflict)).toBe(false)
  })

  it('gives whoever may fill this meeting its absence flags and the way to act', async () => {
    vi.mocked(canEditEvent).mockResolvedValue(true)
    const result = await nextMeetingForViewer(
      db,
      viewer([Permission.CanViewPrograms, Permission.CanAssignProgramParts], 'programmes'),
    )
    expect(result?.canAct).toBe(true)
    expect(result?.meeting.eventParts.find(p => p.id === 11)?.hasConflict).toBe(true)
  })

  it('never lets someone act on a meeting whose programmes they cannot open', async () => {
    vi.mocked(isProgrammeOnBoardFor).mockResolvedValue(true)
    vi.mocked(canEditEvent).mockResolvedValue(true)
    const result = await nextMeetingForViewer(db, viewer([Permission.CanViewBoard], 'board'))
    expect(result?.canAct).toBe(false)
  })

  it('still hands the urgent list their own parts when they read no schedule at all', async () => {
    const result = await nextMeetingForViewer(db, viewer([], null))
    expect(result?.showCard).toBe(false)
    expect(result?.meeting.eventParts.map(p => p.id)).toEqual([10])
  })

  it('returns nothing when no meeting is coming', async () => {
    vi.mocked(getNextMeeting).mockResolvedValue(null)
    expect(await nextMeetingForViewer(db, viewer([Permission.CanViewPrograms], 'programmes'))).toBeNull()
  })
})
