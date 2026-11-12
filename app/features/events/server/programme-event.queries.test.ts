import { describe, expect, it } from 'vitest'

import { EventTemplateKey } from '~/features/events/model/event-template.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { findProgrammeEvent } from './programme-event.queries'

// Absences live in the Event table too, under the « Absence » template. The programme pages open an event by its id
// from the address: an absence must not open there (it could be published, turned into a draft or moved).

interface Row {
  id: number
  congregationId: number
  template: { key: string } | null
}

const rows: Row[] = [
  { id: 1, congregationId: 10, template: { key: EventTemplateKey.WeekendMeeting } },
  { id: 2, congregationId: 10, template: { key: EventTemplateKey.DayOff } },
  { id: 3, congregationId: 10, template: null },
  { id: 4, congregationId: 20, template: { key: EventTemplateKey.WeekendMeeting } },
]

type Where = { id: number; congregationId: number; NOT?: { template?: { key?: string } } }

// A stand-in for Prisma that applies the parts of the where clause these lookups use, as Postgres would: a relation
// filter on a missing template does not match, so its NOT does.
const db = {
  event: {
    findFirst: async ({ where }: { where: Where }) =>
      rows.find(row => {
        if (row.id !== where.id || row.congregationId !== where.congregationId) return false
        const notKey = where.NOT?.template?.key
        if (notKey != null && row.template?.key === notKey) return false
        return true
      }) ?? null,
  },
} as unknown as TransactionClient

describe('findProgrammeEvent', () => {
  it('finds a meeting of the congregation', async () => {
    expect((await findProgrammeEvent(db, 1, 10))?.id).toBe(1)
  })

  it('never returns an absence', async () => {
    expect(await findProgrammeEvent(db, 2, 10)).toBeNull()
  })

  it('finds an event made without a template', async () => {
    expect((await findProgrammeEvent(db, 3, 10))?.id).toBe(3)
  })

  it('stays within the congregation', async () => {
    expect(await findProgrammeEvent(db, 4, 10)).toBeNull()
  })
})
