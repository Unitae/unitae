export interface ConflictingEvent {
  eventId: number
  eventName: string
  eventDate: string
}

interface EventWithDates {
  startDate: Date | string
  endDate: Date | string
}

export function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function groupEventsByWeek<T extends EventWithDates>(events: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()

  for (const event of events) {
    const startMonday = getMonday(new Date(event.startDate))
    const endMonday = getMonday(new Date(event.endDate))

    const current = new Date(startMonday)
    while (current <= endMonday) {
      const key = current.toISOString().split('T')[0]

      const group = groups.get(key)
      if (group) {
        group.push(event)
      } else {
        groups.set(key, [event])
      }

      current.setDate(current.getDate() + 7)
    }
  }

  return groups
}

export function computeDurationDays(startDate: Date, endDate: Date): number {
  return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
}

export function getConflictsForWeek(conflicts: ConflictingEvent[], mondayKey: string): ConflictingEvent[] {
  const monday = new Date(mondayKey)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 7)

  return conflicts.filter(c => {
    const date = new Date(c.eventDate)
    return date >= monday && date < sunday
  })
}
