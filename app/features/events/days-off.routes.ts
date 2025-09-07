import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes'

export const daysOffRoutes = [
  ...prefix('days-off', [
    route('new', 'features/events/routes/days-off/new.tsx'),
    index('features/events/routes/days-off/list.tsx'),
    route(':eventId/delete', 'features/events/routes/days-off/delete.tsx'),
  ]),
] satisfies RouteConfig
