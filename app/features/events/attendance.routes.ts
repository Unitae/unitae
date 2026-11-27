import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes'

export const attendanceRoutes = [
  ...prefix('attendance', [
    index('features/events/routes/attendance/index.tsx'),
    route('record', 'features/events/routes/attendance/record.tsx'),
    route('record.pdf', 'features/events/routes/attendance/record-pdf.tsx'),
    route('attendance.xlsx', 'features/events/routes/attendance/spreadsheet.tsx'),
    route('branch-report.pdf', 'features/events/routes/attendance/branch-report-pdf.tsx'),
  ]),
] satisfies RouteConfig
