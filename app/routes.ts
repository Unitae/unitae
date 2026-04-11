import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes'

import { authenticationRoutes } from './features/authentication/authentication.routes'
import { daysOffRoutes } from './features/events/days-off.routes'
import { programsRoutes } from './features/events/programs.routes'
import { territoryManagementRoutes } from './features/territories/territory-management.routes'

export default [
  index('routes/_index.tsx'),
  route('health', 'routes/health.tsx'),
  route('suspended', 'routes/suspended.tsx'),
  route('trial-expired', 'routes/trial-expired.tsx'),
  route('congregation-not-found', 'routes/congregation-not-found.tsx'),
  route('privacy', 'routes/privacy.tsx'),
  ...authenticationRoutes,
  route('', 'routes/_authenticated-layout.tsx', [
    route('me', 'features/authentication/routes/user/_layout.tsx', [
      route('profile', 'features/authentication/routes/user/profile.tsx'),
      route('consents', 'features/authentication/routes/user/consents.tsx'),
      ...daysOffRoutes,
    ]),
    route('board', 'features/board/routes/_layout.tsx', [
      index('features/board/routes/index.tsx'),
      ...prefix('sections', [
        index('features/board/routes/sections/list.tsx'),
        route('new', 'features/board/routes/sections/new.tsx'),
        route('/:sectionId/edit', 'features/board/routes/sections/edit.tsx'),
        route('/:sectionId/delete', 'features/board/routes/sections/delete.tsx'),
        route('/:sectionId/move-up', 'features/board/routes/sections/move-up.tsx'),
        route('/:sectionId/move-down', 'features/board/routes/sections/move-down.tsx'),
      ]),
      ...prefix('documents', [
        index('features/board/routes/documents/list.tsx'),
        route('new', 'features/board/routes/documents/new.tsx'),
        route('/:documentId/edit', 'features/board/routes/documents/edit.tsx'),
        route('/:documentId/delete', 'features/board/routes/documents/delete.tsx'),
        route('/:documentId/move-up', 'features/board/routes/documents/move-up.tsx'),
        route('/:documentId/move-down', 'features/board/routes/documents/move-down.tsx'),
        route('/:documentId/view', 'features/board/routes/documents/pdf-loader.tsx'),
      ]),
    ]),
    route('settings', 'features/settings/routes/_layout.tsx', [
      index('features/settings/routes/index.tsx'),
      ...prefix('users', [
        index('features/settings/routes/users/user-list.tsx'),
        route('new', 'features/settings/routes/users/new-user.tsx'),
        ...prefix(':userId', [
          route('edit', 'features/settings/routes/users/edit-user.tsx'),
          route('export-data', 'features/settings/routes/users/export-data.tsx'),
          route('anonymize', 'features/settings/routes/users/anonymize.tsx'),
          route('make-publisher', 'features/settings/routes/users/make-publisher.tsx'),
          route('unmake-publisher', 'features/settings/routes/users/unmake-publisher.tsx'),
        ]),
      ]),
      route('territories', 'features/settings/routes/territories/settings.tsx'),
      route('congregation', 'features/settings/routes/congregation/settings.tsx'),
      route('congregation/event-kinds', 'features/settings/routes/congregation/event-kind-list.tsx'),
    ]),
    route('congregation', 'features/publishers/routes/_layout.tsx', [
      ...prefix('publishers', [
        index('features/publishers/routes/publishers/publisher-list.tsx'),
        route('new', 'features/publishers/routes/publishers/new-publisher.tsx'),
        ...prefix(':publisherId', [
          route('view', 'features/publishers/routes/publishers/publisher.tsx'),
          route('edit', 'features/publishers/routes/publishers/edit-publisher.tsx'),
        ]),
        ...prefix('activity', [
          index('features/publishers/routes/activity/publisher-list.tsx'),
          route('export/:year/xlsx', 'features/publishers/routes/activity/excel-export.tsx'),
          route('export/:year/pdfs', 'features/publishers/routes/activity/pdf-export.tsx'),
          route('new', 'features/publishers/routes/activity/new.tsx'),
          route(':activityId/edit', 'features/publishers/routes/activity/edit.tsx'),
          route(':activityId/delete', 'features/publishers/routes/activity/delete.tsx'),
        ]),
      ]),
      ...prefix('publisher-groups', [
        index('features/publishers/routes/publishers/group-list.tsx'),
        route('new', 'features/publishers/routes/publishers/new-group.tsx'),
        ...prefix(':groupId', [
          route('view', 'features/publishers/routes/publishers/group.tsx'),
          route('edit', 'features/publishers/routes/publishers/edit-group.tsx'),
          route('delete', 'features/publishers/routes/publishers/delete-group.tsx'),
        ]),
      ]),
      ...programsRoutes,
    ]),
    ...territoryManagementRoutes,
    route('platform-admin', 'features/platform-admin/routes/_layout.tsx', [
      index('features/platform-admin/routes/index.tsx'),
      route('congregations', 'features/platform-admin/routes/congregations.tsx'),
      route('congregations/:congregationId/edit', 'features/platform-admin/routes/edit-congregation.tsx'),
      route('users', 'features/platform-admin/routes/users.tsx'),
    ]),
  ]),
] satisfies RouteConfig
