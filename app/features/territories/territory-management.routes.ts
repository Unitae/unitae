import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes'
import { territoryProspection } from './territory-prospection.routes'
import { territoryStatsRoutes } from './territory-stats.routes'

export const territoryManagementRoutes = [
  route('territories', 'features/territories/routes/_layout.tsx', [
    index('features/territories/routes/territory/list.tsx'),
    ...territoryStatsRoutes,
    ...territoryProspection,
    route('api/entrances-in-bbox', 'features/territories/routes/api/entrances-in-bbox.tsx'),
    route('api/territory/:territoryId/content', 'features/territories/routes/api/territory-content.tsx'),
    ...prefix('attributions', [
      index('features/territories/routes/attributions/list.tsx'),
      route('new/available-territories', 'features/territories/routes/attributions/territories.tsx'),
      route('new', 'features/territories/routes/attributions/new.tsx'),
      route(':attributionId/edit', 'features/territories/routes/attributions/edit.tsx'),
      route(':attributionId/delete', 'features/territories/routes/attributions/delete.tsx'),
      route('export/:year/xlsx', 'features/territories/routes/attributions/excel-export.tsx'),
      route('export/:year/pdf', 'features/territories/routes/attributions/pdf-export.tsx'),
    ]),
  ]),
] satisfies RouteConfig
