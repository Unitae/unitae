import type { ExportMonth } from '~/features/publishers/model/export-months'
import { formatMonthYear } from '~/features/publishers/ui/report-month-format'
import * as m from '~/i18n/paraglide/messages'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

/** The S-1's month, as the S-21's year: the months `exportMonths` offers, newest first. */
export function ExportMonthField({
  month,
  months,
  onMonthChange,
}: {
  month: ExportMonth
  months: ExportMonth[]
  onMonthChange: (m: ExportMonth) => void
}) {
  const key = (value: ExportMonth) => `${value.year}-${value.month}`
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="export-month">{m.activity_export_dialog_month_label()}</Label>
      <Select
        value={key(month)}
        onValueChange={value => onMonthChange(months.find(each => key(each) === value) ?? month)}
      >
        <SelectTrigger id="export-month">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map(each => (
            <SelectItem key={key(each)} value={key(each)}>
              {formatMonthYear(each.month, each.year)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
