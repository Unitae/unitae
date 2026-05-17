import type { TransactionClient } from '~/shared/infra/db.server'

export function createProgrammeTemplate(
  db: TransactionClient,
  data: {
    name: string
    key: string
    weekDay: number | null
    startTime: string
    endTime: string
    congregationId: number
  },
) {
  return db.programmeTemplate.create({
    data: {
      name: data.name,
      key: data.key,
      weekDay: data.weekDay,
      isRecurring: data.weekDay != null,
      startTime: data.startTime,
      endTime: data.endTime,
      congregationId: data.congregationId,
    },
  })
}
