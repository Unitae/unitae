import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes'

export const programsRoutes = [
  ...prefix('programs', [
    index('features/events/routes/programs/list.tsx'),
    route('days-off', 'features/events/routes/programs/days-off.tsx'),
  ]),
] satisfies RouteConfig
