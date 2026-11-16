import { ATTENDANCE_KINDS, AttendanceKind } from '~/features/events'
import * as m from '~/i18n/paraglide/messages'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

const LABEL: Record<AttendanceKind, () => string> = {
  [AttendanceKind.None]: m.settings_template_attendance_none,
  [AttendanceKind.Midweek]: m.settings_template_attendance_midweek,
  [AttendanceKind.Weekend]: m.settings_template_attendance_weekend,
  [AttendanceKind.Separate]: m.settings_template_attendance_separate,
}

/** How a template's meetings count in attendance: which average and which S-88 column, kept apart, or not at all. */
export function AttendanceKindField({ value }: { value: AttendanceKind }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor="template-attendance">{m.settings_template_attendance_label()}</Label>
      <Select name="attendanceKind" defaultValue={value}>
        <SelectTrigger id="template-attendance" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ATTENDANCE_KINDS.map(kind => (
            <SelectItem key={kind} value={kind}>
              {LABEL[kind]()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-faint text-xs">{m.settings_template_attendance_hint()}</p>
    </div>
  )
}
