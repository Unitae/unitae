import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes'

export const daysOffRoutes = [
  ...prefix('days-off', [
    route('new', 'features/events/routes/days-off/new.tsx'),
    index('features/events/routes/days-off/list.tsx'),
    // Not ':id/delete': that address took a day-off event's id, and a page opened before the change still posts one.
    route('absences/:absenceId/delete', 'features/events/routes/days-off/delete.tsx'),
  ]),
] satisfies RouteConfig
