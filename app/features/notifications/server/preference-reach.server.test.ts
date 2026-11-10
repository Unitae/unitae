import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'
import type { NotificationTypeDefinition } from '../model/notification-definition'

vi.mock('~/shared/auth/permissions.server', () => ({
  receivesRoleNotifications: vi.fn(),
}))

const { reachableNotificationTypes } = await import('./preference-reach.server')
const { receivesRoleNotifications } = await import('~/shared/auth/permissions.server')

const db = {} as never

function def(type: string, rest: Partial<NotificationTypeDefinition>): NotificationTypeDefinition {
  return {
    type,
    category: { key: type.split('.')[0] ?? type, label: () => type },
    label: () => type,
    routing: { debounceMinutes: 0, recipientStrategy: 'entity-user' },
    payload: {} as never,
    subject: () => type,
    renderEmail: () => null,
    example: {},
    ...rest,
  }
}

const reader = (overrides: Partial<Parameters<typeof reachableNotificationTypes>[1]> = {}) => ({
  accountId: 7,
  congregationId: 3,
  hasMember: true,
  permissions: new Set<Permission>(),
  ...overrides,
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('reachableNotificationTypes', () => {
  it('keeps a role fan-out type only for an account the delivery would pick', async () => {
    const board = def('board.document.created', {
      routing: { debounceMinutes: 5, recipientStrategy: 'role', recipientRole: Permission.CanReviewBoardDocuments },
    })
    vi.mocked(receivesRoleNotifications).mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    expect(await reachableNotificationTypes(db, reader(), [board])).toEqual(new Set(['board.document.created']))
    expect(await reachableNotificationTypes(db, reader(), [board])).toEqual(new Set())
    expect(vi.mocked(receivesRoleNotifications).mock.calls[0]).toEqual([db, 7, 3, Permission.CanReviewBoardDocuments])
  })

  it('reads the recipient role of a cancelling type from its fallback', async () => {
    const deleted = def('board.document.deleted', {
      routing: {
        cancels: ['board.document.created'],
        fallback: { debounceMinutes: 0, recipientStrategy: 'role', recipientRole: Permission.CanReviewBoardDocuments },
      },
    })
    vi.mocked(receivesRoleNotifications).mockResolvedValue(false)

    expect(await reachableNotificationTypes(db, reader(), [deleted])).toEqual(new Set())
  })

  it('keeps a type addressed to a record only for an account linked to one', async () => {
    const assigned = def('programme.assignment.assigned', { audience: { member: true } })

    expect(await reachableNotificationTypes(db, reader({ hasMember: true }), [assigned])).toEqual(
      new Set(['programme.assignment.assigned']),
    )
    expect(await reachableNotificationTypes(db, reader({ hasMember: false }), [assigned])).toEqual(new Set())
  })

  it('keeps a type caused by an action only for an account allowed to take it', async () => {
    const sync = def('territory.sync.completed', { audience: { permission: Permission.CanManageBuildings } })

    expect(
      await reachableNotificationTypes(db, reader({ permissions: new Set([Permission.CanManageBuildings]) }), [sync]),
    ).toEqual(new Set(['territory.sync.completed']))
    expect(await reachableNotificationTypes(db, reader(), [sync])).toEqual(new Set())
  })

  it('keeps a type that says nothing about its audience', async () => {
    expect(await reachableNotificationTypes(db, reader(), [def('misc.any', {})])).toEqual(new Set(['misc.any']))
  })
})
