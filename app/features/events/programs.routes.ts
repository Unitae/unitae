import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes'

export const programsRoutes = [
  ...prefix('programs', [
    index('features/events/routes/programs/list.tsx'),
    route('days-off', 'features/events/routes/programs/days-off.tsx'),
    ...prefix('templates/:templateId', [
      index('features/events/routes/programs/templates/view.tsx'),
      route('edit', 'features/events/routes/programs/templates/edit.tsx'),
      route('generate', 'features/events/routes/programs/templates/generate.tsx'),
      route('responsible', 'features/events/routes/programs/templates/responsible.tsx'),
    ]),
    ...prefix('events/:eventId', [
      index('features/events/routes/programs/events/view.tsx'),
      route('assign-part', 'features/events/routes/programs/events/assign-part.tsx'),
      route('assign-service', 'features/events/routes/programs/events/assign-service.tsx'),
      route('remove-assignment', 'features/events/routes/programs/events/remove-assignment.tsx'),
    ]),
  ]),
] satisfies RouteConfig
