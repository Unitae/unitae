import { Panel } from '@unitae/ui'

import type { ActivityMonth } from '~/features/publishers/model/activity-months'
import type { RecordReportMonth } from '~/features/publishers/server/publisher-record.queries'
import * as m from '~/i18n/paraglide/messages'

import { ReportDots, ReportLegend } from './GroupReportCells'

interface RecordActivityProps {
  serviceYear: number
  months: RecordReportMonth[]
  /** What the reader may do with a month's report, as the report panel's route decides it. */
  canRecord: boolean
  canCorrect: boolean
  selectedMonth: ActivityMonth | null
  onOpen: (month: ActivityMonth, trigger: HTMLElement) => void
}

/** The person's service year in twelve dots, as on the group page; a dot opens its report when the reader may. */
export function RecordActivity({
  serviceYear,
  months,
  canRecord,
  canCorrect,
  selectedMonth,
  onOpen,
}: RecordActivityProps) {
  const due = months.filter(month => month.status !== 'not-expected')
  const filed = due.filter(month => month.status === 'filed' || month.status === 'irregular').length
  return (
    <Panel
      title={m.publishers_record_activity()}
      padded
      actions={
        <span className="text-faint text-sm tabular-nums">
          {m.pioneers_service_year({ start: String(serviceYear), end: String(serviceYear + 1) })}
          {due.length > 0 && ` · ${m.publishers_record_reports_filed({ filed, due: due.length })}`}
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <ReportDots
          reports={months}
          canCorrect={canCorrect}
          canRecord={canRecord}
          selectedMonth={selectedMonth}
          onOpen={onOpen}
        />
        <ReportLegend />
      </div>
    </Panel>
  )
}
