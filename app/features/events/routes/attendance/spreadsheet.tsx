import { buildAttendanceXlsx } from '~/features/events/server/attendance-xlsx.server'
import * as m from '~/i18n/paraglide/messages'
import { loadAttendanceExport } from './_export.server'

import type { Route } from './+types/spreadsheet'

/** The service year shown as a spreadsheet: every meeting held, and the year month by month. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { meetings, serviceYear, timeZone, now } = await loadAttendanceExport(request, context)
  const file = await buildAttendanceXlsx({ meetings, serviceYear, timeZone, now })
  const filename = m.attendance_record_filename_xlsx({ year: `${serviceYear}-${serviceYear + 1}` })
  return new Response(new Uint8Array(file), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
