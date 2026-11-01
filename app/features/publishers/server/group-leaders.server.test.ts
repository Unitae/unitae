import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/messages', () => ({
  groups_form_error_not_eligible: () => 'not eligible',
  groups_form_error_same_person: () => 'same person',
  groups_form_error_already_responsible: ({ name }: { name: string }) => `already oversees ${name}`,
  groups_form_error_already_deputy: ({ name }: { name: string }) => `already assists ${name}`,
}))

const { assertGroupLeaders, GROUP_LEADER_WHERE } = await import('./group-leaders.server')
const { ValidationError } = await import('~/shared/errors/app-error.server')

const findMany = vi.fn()
const db = { member: { findMany } } as never

function brother(id: number, leads: { responsibleFor?: number; deputyFor?: number } = {}) {
  return {
    id,
    responsibleFor:
      leads.responsibleFor != null ? { id: leads.responsibleFor, name: `G${leads.responsibleFor}` } : null,
    deputyFor: leads.deputyFor != null ? { id: leads.deputyFor, name: `G${leads.deputyFor}` } : null,
  }
}

async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  )
  expect(error).toBeInstanceOf(ValidationError)
  const { field, message } = error as InstanceType<typeof ValidationError>
  return { field, message }
}

beforeEach(() => {
  findMany.mockReset()
})

describe('assertGroupLeaders', () => {
  it('accepts an eligible overseer and deputy who lead no other group', async () => {
    findMany.mockResolvedValue([brother(1), brother(2)])

    await expect(assertGroupLeaders(db, 7, { responsibleId: 1, deputyId: 2 })).resolves.toBeUndefined()
  })

  it('looks the leaders up among the eligible brothers of the congregation', async () => {
    findMany.mockResolvedValue([brother(1)])

    await assertGroupLeaders(db, 7, { responsibleId: 1, deputyId: null })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [1] }, congregationId: 7, ...GROUP_LEADER_WHERE } }),
    )
  })

  // Regression: the form only offered eligible brothers, the server took any member id.
  it('refuses an overseer who is not an eligible brother', async () => {
    findMany.mockResolvedValue([])

    await expect(rejection(assertGroupLeaders(db, 7, { responsibleId: 1, deputyId: null }))).resolves.toEqual({
      field: 'responsible',
      message: 'not eligible',
    })
  })

  it('refuses a deputy who is not an eligible brother', async () => {
    findMany.mockResolvedValue([brother(1)])

    await expect(rejection(assertGroupLeaders(db, 7, { responsibleId: 1, deputyId: 2 }))).resolves.toEqual({
      field: 'deputy',
      message: 'not eligible',
    })
  })

  it('refuses the same person as overseer and deputy', async () => {
    findMany.mockResolvedValue([brother(1)])

    await expect(rejection(assertGroupLeaders(db, 7, { responsibleId: 1, deputyId: 1 }))).resolves.toEqual({
      field: 'deputy',
      message: 'same person',
    })
  })

  // Regression: the unique constraint on responsibleId turned this into a 500.
  it('refuses an overseer who already oversees another group', async () => {
    findMany.mockResolvedValue([brother(1, { responsibleFor: 3 })])

    await expect(
      rejection(assertGroupLeaders(db, 7, { responsibleId: 1, deputyId: null, groupId: 4 })),
    ).resolves.toEqual({ field: 'responsible', message: 'already oversees G3' })
  })

  it('refuses a deputy who already assists another group', async () => {
    findMany.mockResolvedValue([brother(1), brother(2, { deputyFor: 3 })])

    await expect(rejection(assertGroupLeaders(db, 7, { responsibleId: 1, deputyId: 2, groupId: 4 }))).resolves.toEqual({
      field: 'deputy',
      message: 'already assists G3',
    })
  })

  it('refuses any leadership elsewhere for a group being created', async () => {
    findMany.mockResolvedValue([brother(1, { deputyFor: 3 })])

    await expect(rejection(assertGroupLeaders(db, 7, { responsibleId: 1, deputyId: null }))).resolves.toEqual({
      field: 'responsible',
      message: 'already assists G3',
    })
  })

  it('lets the overseer and deputy of the group swap places', async () => {
    findMany.mockResolvedValue([brother(1, { deputyFor: 4 }), brother(2, { responsibleFor: 4 })])

    await expect(assertGroupLeaders(db, 7, { responsibleId: 1, deputyId: 2, groupId: 4 })).resolves.toBeUndefined()
  })
})
