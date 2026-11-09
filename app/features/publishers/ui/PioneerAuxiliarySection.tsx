import { Avatar, SectionHeading, Status } from '@unitae/ui'
import { Link } from 'react-router'

import type { PioneerAuxiliaryRow } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

import { hoursText } from './pioneer-pace-copy'

const headClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const cellClass = 'border-border border-b px-3.5 py-2.5 align-middle group-last:border-b-0'

// Auxiliary pioneers are for information only: their hours against their goal, without a verdict on the year.
export function PioneerAuxiliarySection({ rows }: { rows: PioneerAuxiliaryRow[] }) {
  if (rows.length === 0) return null

  return (
    <section aria-labelledby="pioneers-auxiliary" className="flex flex-col gap-2">
      <SectionHeading
        id="pioneers-auxiliary"
        title={m.pioneers_section_auxiliary()}
        meta={rows.length}
        actions={<span className="text-faint text-xs">{m.pioneers_section_auxiliary_hint()}</span>}
      />
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="max-md:hidden">
            <tr>
              <th className={headClass}>{m.activity_table_name()}</th>
              <th className={headClass}>{m.pioneers_col_enrolment()}</th>
              <th className={headClass}>{m.pioneers_col_this_month()}</th>
              <th className={headClass}>{m.pioneers_col_goal_met()}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const name = formatPersonName(row)
              const current = row.auxiliary.thisMonth
              return (
                <tr key={row.memberId} className="group">
                  <td className={cellClass}>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={name} />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <Link
                          to={`/publishers/${row.memberId}/view#activity`}
                          className="truncate font-medium hover:underline"
                        >
                          {name}
                        </Link>
                        {row.groupName && <span className="text-faint text-xs">{formatGroupName(row.groupName)}</span>}
                      </span>
                    </span>
                  </td>
                  <td className={cn(cellClass, 'max-md:hidden')}>
                    {row.permanent ? m.pioneers_aux_permanent() : m.pioneers_aux_monthly()}
                    <span className="text-faint">
                      {' '}
                      · {m.pioneers_aux_standard_target({ rate: String(row.monthlyRate) })}
                    </span>
                  </td>
                  <td className={cn(cellClass, 'max-md:hidden tabular-nums')}>
                    {current == null ? (
                      <span className="text-faint">—</span>
                    ) : current.reported ? (
                      hoursText(current.hours + current.credit)
                    ) : (
                      <Status tone="neutral">{m.pioneers_aux_report_pending()}</Status>
                    )}
                  </td>
                  <td className={cn(cellClass, 'tabular-nums')}>
                    {row.auxiliary.reportedMonths > 0 ? (
                      m.pioneers_aux_met_of({ met: row.auxiliary.metMonths, total: row.auxiliary.reportedMonths })
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
