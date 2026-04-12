import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes'

export const programsRoutes = [
  ...prefix('programs', [
    index('features/events/routes/programs/list.tsx'),
    route('new', 'features/events/routes/programs/new.tsx'),
    route('days-off', 'features/events/routes/programs/days-off.tsx'),
    ...prefix('events/:eventId', [
      index('features/events/routes/programs/events/view.tsx'),
      route('assign-part', 'features/events/routes/programs/events/assign-part.tsx'),
      route('assign-service', 'features/events/routes/programs/events/assign-service.tsx'),
      route('remove-assignment', 'features/events/routes/programs/events/remove-assignment.tsx'),
    ]),
  ]),
] satisfies RouteConfig
