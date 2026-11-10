import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes'

export const territoryProspection = [
  route('buildings/split-territories', 'features/territories/routes/split-tool/_layout.tsx', [
    index('features/territories/routes/split-tool/list.tsx'),
    route('phones', 'features/territories/routes/split-tool/phones.tsx'),
    route('hotels', 'features/territories/routes/split-tool/hotels.tsx'),
    route('commerces', 'features/territories/routes/split-tool/commerces.tsx'),
    route('campus', 'features/territories/routes/split-tool/university.tsx'),
    route('create', 'features/territories/routes/split-tool/create.tsx'),
  ]),
  route('buildings', 'features/territories/routes/prospection/list.tsx'),
  route('buildings/sync', 'features/territories/routes/prospection/sync-buildings.tsx'),
  route('buildings/deactivate', 'features/territories/routes/prospection/deactivate-buildings.tsx'),
  // The old list pages, now views of the list above.
  ...['new', 'need-check', 'missing', 'all'].map(path =>
    route(`buildings/${path}`, 'features/territories/routes/prospection/legacy-list.tsx', {
      id: `prospection-legacy-${path}`,
    }),
  ),
  ...prefix('building', [
    route('new', 'features/territories/routes/prospection/new-building.tsx'),
    ...prefix(':buildingId', [
      route('delete', 'features/territories/routes/prospection/delete-building.tsx'),
      route('edit', 'features/territories/routes/prospection/edit-building.tsx'),
      route('edit-prospection', 'features/territories/routes/prospection/edit-building-prospection.tsx'),
      route('disable', 'features/territories/routes/prospection/disable-building.tsx'),
      route('enable', 'features/territories/routes/prospection/enable-building.tsx'),
      route('view', 'features/territories/routes/prospection/building.tsx'),
    ]),
  ]),
] satisfies RouteConfig
