import { prefix, type RouteConfig, route } from '@react-router/dev/routes'

export const territoryStatsRoutes = [
  route('stats', 'features/territories/routes/stats/index.tsx'),
  ...prefix('territory', [
    route('new', 'features/territories/routes/territory/new.tsx'),
    ...prefix(':territoryId', [
      route('view', 'features/territories/routes/territory/view.tsx'),
      route('edit', 'features/territories/routes/territory/edit.tsx'),
      route('delete', 'features/territories/routes/territory/delete.tsx'),
      route('pdf', 'features/territories/routes/territory/pdf-download.tsx'),
    ]),
  ]),
] satisfies RouteConfig
