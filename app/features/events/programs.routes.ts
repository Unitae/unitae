import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes'

export const programsRoutes = [
  ...prefix('programs', [
    index('features/events/routes/programs/list.tsx'),
    route('new', 'features/events/routes/programs/new.tsx'),
    route('bulk-delete', 'features/events/routes/programs/bulk-delete.tsx'),
    route('days-off', 'features/events/routes/programs/days-off.tsx'),
    route('export-pdf', 'features/events/routes/programs/export-pdf.tsx'),
    route('export-pdf/download', 'features/events/routes/programs/export-pdf-download.tsx'),
    ...prefix('events/:eventId', [
      index('features/events/routes/programs/events/view.tsx'),
      route('edit', 'features/events/routes/programs/events/edit.tsx'),
      route('assign-part', 'features/events/routes/programs/events/assign-part.tsx'),
      route('assign-service', 'features/events/routes/programs/events/assign-service.tsx'),
      route('remove-assignment', 'features/events/routes/programs/events/remove-assignment.tsx'),
      route('delete', 'features/events/routes/programs/events/delete.tsx'),
      route('publisher-info', 'features/events/routes/programs/events/publisher-info.tsx'),
      route('external-speaker-info', 'features/events/routes/programs/events/external-speaker-info.tsx'),
      route('reorder-parts', 'features/events/routes/programs/events/reorder-parts.tsx'),
    ]),
    ...prefix('external-speakers', [
      index('features/events/routes/programs/external-speakers/list.tsx'),
      route('new', 'features/events/routes/programs/external-speakers/new.tsx'),
      ...prefix(':externalSpeakerId', [route('edit', 'features/events/routes/programs/external-speakers/edit.tsx')]),
    ]),
  ]),
] satisfies RouteConfig
