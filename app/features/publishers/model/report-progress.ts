import type { ReportStatus } from './member-signals'

export interface ReportProgress {
  /** Reports in, with or without ministry. */
  filed: number
  /** Publishers who owed one: those added after the month did not. */
  expected: number
  /** Expected and not in. */
  missing: number
}

/** One month's reports for a list of publishers, from each one's status that month: « 20 sur 24 », 4 missing. */
export function reportProgress(statuses: ReportStatus[]): ReportProgress {
  const filed = statuses.filter(status => status === 'filed' || status === 'irregular').length
  const missing = statuses.filter(status => status === 'not-filed').length
  return { filed, expected: filed + missing, missing }
}
