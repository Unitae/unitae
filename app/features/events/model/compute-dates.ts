export function computeDatesForWeekdayCount(weekDay: number, count: number, startFrom?: Date): Date[] {
  const dates: Date[] = []
  const base = startFrom ? new Date(startFrom) : new Date()
  base.setHours(0, 0, 0, 0)

  const daysUntilTarget = (weekDay - base.getDay() + 7) % 7
  const current = new Date(base)
  current.setDate(current.getDate() + (daysUntilTarget === 0 ? 0 : daysUntilTarget))

  while (dates.length < count) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 7)
  }

  return dates
}
