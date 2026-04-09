import type { StatsAttribution } from './stats-attribution.type'

export interface MonthlyCount {
  month: string
  count: number
}

// Génère tous les mois entre startDate et endDate au format "YYYY-MM"
function generateMonthRange(startDate: Date, endDate: Date): string[] {
  const months: string[] = []
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1)

  while (current <= end) {
    const year = current.getFullYear()
    const month = String(current.getMonth() + 1).padStart(2, '0')
    months.push(`${year}-${month}`)
    current.setMonth(current.getMonth() + 1)
  }

  return months
}

// Compte le nombre d'attributions démarrées chaque mois sur la période
export function computeAttributionsPerMonth(
  attributions: StatsAttribution[],
  startDate: Date,
  endDate: Date,
): MonthlyCount[] {
  const allMonths = generateMonthRange(startDate, endDate)
  const countMap = new Map<string, number>()

  for (const month of allMonths) {
    countMap.set(month, 0)
  }

  for (const a of attributions) {
    const year = a.startDate.getFullYear()
    const month = String(a.startDate.getMonth() + 1).padStart(2, '0')
    const key = `${year}-${month}`

    if (countMap.has(key)) {
      countMap.set(key, (countMap.get(key) ?? 0) + 1)
    }
  }

  return allMonths.map(month => ({ month, count: countMap.get(month) ?? 0 }))
}
