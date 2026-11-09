import type { PublisherType } from '~/shared/types/publisher-type'

import type { MonthEnrolment } from './month-enrolment.type'

/** A filed report, as the report panel reads it. */
export interface ReportPanelReport {
  id: number
  type: PublisherType
  hours: number | null
  studies: number
  isPublisher: boolean
  notes: string
  creditHours: number | null
}

/** One publisher's month, as the report panel's query returns it. */
export interface ReportPanelMonth {
  publisher: { id: number; firstname: string; lastname: string; groupId: number | null; groupName: string | null }
  month: number
  year: number
  /** The report filed for the month, the latest one when it was filed twice. */
  report: ReportPanelReport | null
  /** The enrolment covering the month: it decides the report's type and goal. */
  enrolment: MonthEnrolment | null
  /** The congregation's monthly rate per pioneer type for the month's service year: the goal without an enrolment. */
  rates: Partial<Record<PublisherType, number>>
}

/** What the panel receives: the month, and what the reader may do with it. */
export interface ReportPanelData extends ReportPanelMonth {
  canGrantCredit: boolean
  canDelete: boolean
}
