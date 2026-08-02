import { Link } from 'react-router'

import type { PioneerAuxiliaryRow } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { Separator } from '~/shared/ui/separator'
import { formatGroupName } from '~/shared/utils/format-group-name'

function detailUrl(memberId: number) {
  return `/publishers/${memberId}/view#activity`
}

// Auxiliary pioneers are informational only — hours against the standard rate as a soft
// reference, no met/not-met verdict (their 15h election is not knowable here).
export function PioneerAuxiliarySection({ rows }: { rows: PioneerAuxiliaryRow[] }) {
  if (rows.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display font-semibold text-lg">{m.pioneers_section_auxiliary()}</h2>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <Separator />
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map(row => (
          <Link
            key={row.memberId}
            to={detailUrl(row.memberId)}
            className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50"
          >
            <div>
              <div className="font-medium">
                {row.firstname} {row.lastname}
              </div>
              <div className="text-muted-foreground text-xs">
                {row.groupName ? `${formatGroupName(row.groupName)} · ` : ''}
                {m.pioneers_aux_months_met({
                  met: String(row.auxiliary.metMonths),
                  total: String(row.auxiliary.enrolledMonths),
                })}
              </div>
            </div>
            <div className="text-right">
              {row.auxiliary.thisMonth && !row.auxiliary.thisMonth.reported ? (
                <Badge variant="outline">{m.pioneers_aux_report_pending()}</Badge>
              ) : (
                <div className="font-semibold tabular-nums">
                  {row.auxiliary.thisMonth ? `${row.auxiliary.thisMonth.hours} h` : '—'}
                </div>
              )}
              <div className="text-muted-foreground text-xs">
                {m.pioneers_aux_standard_target({ rate: String(row.monthlyRate) })}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
