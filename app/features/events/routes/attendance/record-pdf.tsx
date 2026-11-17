import { attendanceReport } from '~/features/events/model/attendance-report'
import { AttendanceRecordDocument } from '~/features/events/ui/pdf/AttendanceRecordDocument'
import * as m from '~/i18n/paraglide/messages'
import { renderPdfResponse } from '~/shared/infra/pdf.server'
import { loadAttendanceExport } from './_export.server'

import type { Route } from './+types/record-pdf'

/** The S-88 card for the service year shown and the one before it, as a PDF. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { meetings, previous, serviceYear } = await loadAttendanceExport(request, context)
  return renderPdfResponse(
    <AttendanceRecordDocument
      years={[
        { serviceYear: serviceYear - 1, ...attendanceReport(previous, serviceYear - 1) },
        { serviceYear, ...attendanceReport(meetings, serviceYear) },
      ]}
    />,
    m.attendance_record_filename_pdf({ year: `${serviceYear}-${serviceYear + 1}` }),
  )
}
