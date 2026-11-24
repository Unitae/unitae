import { describe, expect, it, vi } from 'vitest'

const holding: Record<number, number[]> = { 7: [1, 2], 8: [] }
vi.mock('~/shared/auth/permissions.server', () => ({
  findMembersWithAnyRole: vi.fn(async (_db: unknown, roleIds: number[]) => holding[roleIds[0] ?? 0] ?? []),
}))

const { holdersOfRoles } = await import('./role-holders.queries')

const members = [
  { id: 1, firstname: 'Marc', lastname: 'Dupont' },
  { id: 2, firstname: 'Luc', lastname: 'Martin' },
]
const db = {
  member: {
    findMany: vi.fn(async ({ where }: { where: { id: { in: number[] } } }) =>
      members.filter(member => where.id.in.includes(member.id)),
    ),
  },
}

describe('holdersOfRoles', () => {
  it('names who holds each role once, and nobody for a role no one holds', async () => {
    const holders = await holdersOfRoles(db as never, [7, 8, 7], 3)
    expect([...holders.keys()]).toEqual([7, 8])
    expect(holders.get(7)).toHaveLength(2)
    expect(holders.get(7)?.[0]).toContain('Marc')
    expect(holders.get(8)).toEqual([])
  })
})
