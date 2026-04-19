import type { TransactionClient } from '~/shared/infra/db.server'
import { getBeginingDateOfTheocraticYear, getEndDateOfTheocraticYear } from './theocratic-year.server'

export async function getTerritoriesExportData(db: TransactionClient, congregationId: number, theocraticYear?: number) {
  const startDate = getBeginingDateOfTheocraticYear(theocraticYear)
  const endDate = getEndDateOfTheocraticYear(theocraticYear)

  const startDatePreviousYear = new Date(startDate)
  startDatePreviousYear.setFullYear(startDatePreviousYear.getFullYear() - 1)
  const endDatePreviousYear = new Date(endDate)
  endDatePreviousYear.setFullYear(endDatePreviousYear.getFullYear() - 1)

  return await db.territory.findMany({
    where: { congregationId },
    include: {
      attributions: {
        orderBy: { startDate: 'desc' },
        take: 5,
        where: {
          // biome-ignore lint/style/useNamingConvention: prisma does not support snake_case
          OR: [
            {
              startDate: {
                gte: startDate,
                lte: endDate,
              },
            },
            {
              startDate: {
                gte: startDatePreviousYear,
                lte: endDatePreviousYear,
              },
              endDate: {
                gte: startDate,
                lte: endDate,
              },
            },
            {
              startDate: {
                gte: startDatePreviousYear,
                lte: endDatePreviousYear,
              },
              endDate: null,
            },
            {
              startDate: {
                lt: startDatePreviousYear,
              },
              endDate: null,
            },
          ],
        },
        include: {
          publisher: true,
        },
      },
    },
  })
}
