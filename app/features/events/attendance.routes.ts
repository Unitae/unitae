import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes'

export const attendanceRoutes = [
  ...prefix('attendance', [
    index('features/events/routes/attendance/index.tsx'),
    route('record', 'features/events/routes/attendance/record.tsx'),
  ]),
] satisfies RouteConfig
