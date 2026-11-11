import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

vi.mock('~/features/events/index.server', () => ({ getResponsibleTemplateIds: vi.fn() }))

const { getResponsibleTemplateIds } = await import('~/features/events/index.server')
const { loadSettingsAccess } = await import('./settings-access.server')

const db = {} as TransactionClient
const USER_ID = 7
const CONGREGATION_ID = 3

beforeEach(() => {
  vi.resetAllMocks()
})

describe('loadSettingsAccess', () => {
  it('carries the rights as they are', async () => {
    vi.mocked(getResponsibleTemplateIds).mockResolvedValue([])
    const permissions = new Set([Permission.CanManageUsers])

    const access = await loadSettingsAccess(db, permissions, USER_ID, CONGREGATION_ID)

    expect(access.permissions).toBe(permissions)
  })

  it('marks a holder of a role that runs a template, for either part of it', async () => {
    vi.mocked(getResponsibleTemplateIds).mockResolvedValue([12])

    const access = await loadSettingsAccess(db, new Set([Permission.CanViewPrograms]), USER_ID, CONGREGATION_ID)

    expect(access.templateResponsible).toBe(true)
    expect(getResponsibleTemplateIds).toHaveBeenCalledWith(db, USER_ID, CONGREGATION_ID, 'service')
  })

  it('does not mark someone whose roles run no template', async () => {
    vi.mocked(getResponsibleTemplateIds).mockResolvedValue([])

    const access = await loadSettingsAccess(db, new Set(), USER_ID, CONGREGATION_ID)

    expect(access.templateResponsible).toBe(false)
  })

  it('skips the lookup for a template manager, whose right already opens the templates', async () => {
    const access = await loadSettingsAccess(
      db,
      new Set([Permission.CanManageProgramTemplates]),
      USER_ID,
      CONGREGATION_ID,
    )

    expect(access.templateResponsible).toBe(false)
    expect(getResponsibleTemplateIds).not.toHaveBeenCalled()
  })
})
