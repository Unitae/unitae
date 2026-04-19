import type { TransactionClient } from '~/shared/libs/db.server'

export function createProgrammeTemplate(
  db: TransactionClient,
  data: {
    name: string
    key: string
    weekDay: number | null
    congregationId: number
  },
) {
  return db.programmeTemplate.create({
    data: {
      name: data.name,
      key: data.key,
      weekDay: data.weekDay,
      isRecurring: data.weekDay != null,
      congregationId: data.congregationId,
    },
  })
}
