import { describe, expect, it } from 'vitest'

import { EventTemplateKey } from '~/features/events/model/event-template.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { findProgrammeEvent } from './programme-event.queries'

// The programme pages open an event by its id from the address: any event of the congregation, never another's.

interface Row {
  id: number
  congregationId: number
  template: { key: string } | null
}

const rows: Row[] = [
  { id: 1, congregationId: 10, template: { key: EventTemplateKey.WeekendMeeting } },
  { id: 3, congregationId: 10, template: null },
  { id: 4, congregationId: 20, template: { key: EventTemplateKey.WeekendMeeting } },
]

type Where = { id: number; congregationId: number }

const db = {
  event: {
    findFirst: async ({ where }: { where: Where }) =>
      rows.find(row => row.id === where.id && row.congregationId === where.congregationId) ?? null,
  },
} as unknown as TransactionClient

describe('findProgrammeEvent', () => {
  it('finds a meeting of the congregation', async () => {
    expect((await findProgrammeEvent(db, 1, 10))?.id).toBe(1)
  })

  it('finds an event made without a template', async () => {
    expect((await findProgrammeEvent(db, 3, 10))?.id).toBe(3)
  })

  it('never returns another congregation’s event', async () => {
    expect(await findProgrammeEvent(db, 4, 10)).toBeNull()
  })
})
