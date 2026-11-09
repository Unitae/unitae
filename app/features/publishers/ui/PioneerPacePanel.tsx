import { SidePanel, Sparkline, Status, Tag } from '@unitae/ui'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'

import type { PioneerAnnualRow } from '~/features/publishers/model/pioneer-roster.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'

import { PaceFacts, PaceMonthsChart, PaceTotalChart } from './PioneerPaceDetail'
import { enrolmentStart, overdueLabel, paceLine, paceStatus, studiesLine } from './pioneer-pace-copy'
import { serviceLabel } from './publisher-type-labels'

/** Status, tags and how far ahead or behind, on one line. */
export function PaceHeadline({ row, serviceYear }: { row: PioneerAnnualRow; serviceYear: number }) {
  const status = paceStatus(row)
  const overdue = overdueLabel(row, serviceYear)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status && <Status tone={status.tone}>{status.label}</Status>}
      {row.concluded && <Tag>{m.pioneers_concluded()}</Tag>}
      {overdue && <Tag>{overdue}</Tag>}
      {paceLine(row) && <span className="text-faint text-sm">{paceLine(row)}</span>}
    </div>
  )
}

/** Bible studies across the year, beside the reports' count. */
export function PaceStudies({ row, serviceYear }: { row: PioneerAnnualRow; serviceYear: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-border border-t pt-3">
      <span className="flex flex-col gap-0.5">
        <span className="font-medium text-sm">{m.activity_summary_studies_label()}</span>
        <span className="text-faint text-xs">{studiesLine(row, serviceYear)}</span>
      </span>
      <Sparkline
        values={row.pace.monthlyStudies.map((studies, index) =>
          row.pace.monthStates[index] === 'reported' ? (studies ?? 0) : 'off',
        )}
        className="w-24"
      />
    </div>
  )
}

interface PioneerPacePanelProps {
  row: PioneerAnnualRow
  serviceYear: number
  docked: boolean
  onClose: () => void
  returnFocus: HTMLElement | null
}

/** One pioneer's pace beside the roster from 1280 px, in a sheet below: read only, the record is one link away. */
export function PioneerPacePanel({ row, serviceYear, docked, onClose, returnFocus }: PioneerPacePanelProps) {
  const title = formatPersonName(row)
  const description = [
    serviceLabel(row.type),
    row.groupName ? formatGroupName(row.groupName) : null,
    enrolmentStart(row, serviceYear),
  ]
    .filter(Boolean)
    .join(' · ')
  const body = (
    <div className="flex flex-col gap-4">
      <PaceHeadline row={row} serviceYear={serviceYear} />
      <PaceFacts row={row} />
      <PaceMonthsChart row={row} serviceYear={serviceYear} height={130} />
      <PaceTotalChart row={row} serviceYear={serviceYear} height={140} />
      <PaceStudies row={row} serviceYear={serviceYear} />
    </div>
  )
  const footer = (
    <Button asChild variant="ghost">
      <Link to={`/publishers/${row.memberId}/view?sy=${serviceYear}#activity`}>
        {m.pioneers_open_record()}
        <ArrowRight />
      </Link>
    </Button>
  )

  if (docked) {
    return (
      <SidePanel
        title={title}
        description={description}
        closeLabel={m.common_close()}
        onClose={onClose}
        returnFocus={returnFocus}
        footer={footer}
      >
        {body}
      </SidePanel>
    )
  }
  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{body}</div>
        <SheetFooter className="flex-row justify-end border-border border-t">{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
