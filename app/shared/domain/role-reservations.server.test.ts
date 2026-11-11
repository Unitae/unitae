import { describe, expect, it } from 'vitest'
import { findSoleReservations, hasSoleReservations } from './role-reservations.server'

// What a role alone reserves: a board section only it may read, a part or a service only it may take, a territory
// kind only it may hold. An empty list means "everyone" in each of those places, so deleting that role would open them.

const ROLE = 9
const CONGREGATION = 10

interface Slot {
  slotId: number
  roleId: number
  asKind?: string
}

/** A table of allowed roles answering `findMany` (with the slot it names) and `groupBy` counts per slot. */
function allowedTable(rows: Slot[], slotKey: string, describeSlot: (slotId: number) => Record<string, unknown>) {
  return {
    findMany: async ({ where }: { where: { roleId: number } }) =>
      rows
        .filter(row => row.roleId === where.roleId)
        .map(row => ({ [slotKey]: row.slotId, asKind: row.asKind, ...describeSlot(row.slotId) })),
    groupBy: async ({ where }: { where: Record<string, { in: number[] }> }) => {
      const ids = where[slotKey]?.in ?? []
      const counts = new Map<string, { slot: number; asKind?: string; count: number }>()
      for (const row of rows.filter(r => ids.includes(r.slotId))) {
        const key = `${row.slotId}|${row.asKind ?? ''}`
        const entry = counts.get(key) ?? { slot: row.slotId, asKind: row.asKind, count: 0 }
        entry.count += 1
        counts.set(key, entry)
      }
      return [...counts.values()].map(e => ({ [slotKey]: e.slot, asKind: e.asKind, _count: { roleId: e.count } }))
    },
  }
}

function db(tables: Partial<Record<string, Slot[]>>) {
  return {
    boardSectionVisibilityRole: allowedTable(tables.sections ?? [], 'sectionId', id => ({
      section: { name: `Section ${id}` },
    })),
    territoryKindAllowedRole: allowedTable(tables.kinds ?? [], 'kindId', id => ({
      kind: { key: `kind-${id}`, name: id === 1 ? null : `Kind ${id}` },
    })),
    templatePartAllowedRole: allowedTable(tables.parts ?? [], 'partId', id => ({
      part: { name: `Part ${id}`, template: { name: 'Réunion de semaine' } },
    })),
    templateServicePartAllowedRole: allowedTable(tables.services ?? [], 'servicePartId', id => ({
      servicePart: { name: `Service ${id}`, template: { name: 'Réunion du week-end' } },
    })),
    eventPartAllowedRole: allowedTable(tables.eventParts ?? [], 'eventPartId', () => ({})),
    eventServicePartAllowedRole: allowedTable(tables.eventServices ?? [], 'eventServicePartId', () => ({})),
  } as never
}

describe('findSoleReservations', () => {
  it('names a board section only this role may read', async () => {
    const found = await findSoleReservations(
      db({
        sections: [
          { slotId: 1, roleId: ROLE },
          { slotId: 2, roleId: ROLE },
          { slotId: 2, roleId: 3 },
        ],
      }),
      ROLE,
      CONGREGATION,
    )
    expect(found.sections).toEqual(['Section 1'])
  })

  it('names a territory kind only this role may hold, with its key for a built-in label', async () => {
    const found = await findSoleReservations(db({ kinds: [{ slotId: 1, roleId: ROLE }] }), ROLE, CONGREGATION)
    expect(found.territoryKinds).toEqual([{ key: 'kind-1', name: null }])
  })

  it('counts a part slot as reserved per speaker or reader, not per part', async () => {
    const found = await findSoleReservations(
      db({
        parts: [
          { slotId: 5, roleId: ROLE, asKind: 'speaker' },
          { slotId: 5, roleId: 3, asKind: 'speaker' },
          { slotId: 5, roleId: ROLE, asKind: 'reader' },
        ],
      }),
      ROLE,
      CONGREGATION,
    )
    expect(found.templateSlots).toEqual([{ template: 'Réunion de semaine', name: 'Part 5' }])
  })

  it('names template services and counts the programmes’ own parts and services', async () => {
    const found = await findSoleReservations(
      db({
        services: [{ slotId: 7, roleId: ROLE }],
        eventParts: [
          { slotId: 20, roleId: ROLE, asKind: 'speaker' },
          { slotId: 21, roleId: ROLE, asKind: 'speaker' },
          { slotId: 21, roleId: 3, asKind: 'speaker' },
        ],
        eventServices: [{ slotId: 30, roleId: ROLE }],
      }),
      ROLE,
      CONGREGATION,
    )
    expect(found.templateSlots).toEqual([{ template: 'Réunion du week-end', name: 'Service 7' }])
    expect(found.programmeSlots).toBe(2)
  })

  it('finds nothing for a role that shares every place it is named in', async () => {
    const found = await findSoleReservations(
      db({
        sections: [
          { slotId: 1, roleId: ROLE },
          { slotId: 1, roleId: 3 },
        ],
      }),
      ROLE,
      CONGREGATION,
    )
    expect(hasSoleReservations(found)).toBe(false)
  })
})
