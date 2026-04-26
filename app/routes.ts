import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes'

import { authenticationRoutes } from './features/authentication/authentication.routes'
import { daysOffRoutes } from './features/events/days-off.routes'
import { programsRoutes } from './features/events/programs.routes'
import { territoryManagementRoutes } from './features/territories/territory-management.routes'

export default [
  route('health', 'routes/health.tsx'),
  route('suspended', 'routes/suspended.tsx'),
  route('trial-expired', 'routes/trial-expired.tsx'),
  route('congregation-not-found', 'routes/congregation-not-found.tsx'),
  route('privacy', 'routes/privacy.tsx'),
  route('consent', 'routes/consent.tsx'),
  route('cron/retention', 'routes/cron.retention.tsx'),
  route('cron/board-expirations', 'routes/cron.board-expirations.tsx'),
  route('cron/process-notifications', 'routes/cron.process-notifications.tsx'),
  ...authenticationRoutes,
  route('', 'routes/_authenticated-layout.tsx', [
    index('features/dashboard/routes/index.tsx'),
    route('me', 'features/authentication/routes/user/_layout.tsx', [
      route('profile', 'features/authentication/routes/user/profile.tsx'),
      route('consents', 'features/authentication/routes/user/consents.tsx'),
      route('notifications', 'features/notifications/routes/preferences.tsx'),
      route('territories', 'features/territories/routes/my-territories/list.tsx'),
      route('territories/:territoryId', 'features/territories/routes/my-territories/view.tsx'),
      ...daysOffRoutes,
    ]),
    route('board', 'features/display-board/routes/_layout.tsx', [
      index('features/display-board/routes/index.tsx'),
      ...prefix('sections', [
        index('features/display-board/routes/sections/list.tsx'),
        route('new', 'features/display-board/routes/sections/new.tsx'),
        route('reorder', 'features/display-board/routes/sections/reorder.tsx'),
        route('bulk-delete', 'features/display-board/routes/sections/bulk-delete.tsx'),
        route('/:sectionId/edit', 'features/display-board/routes/sections/edit.tsx'),
        route('/:sectionId/delete', 'features/display-board/routes/sections/delete.tsx'),
        route('/:sectionId/move-up', 'features/display-board/routes/sections/move-up.tsx'),
        route('/:sectionId/move-down', 'features/display-board/routes/sections/move-down.tsx'),
      ]),
      ...prefix('dynamic', [
        route('/:dynamicId/viewer', 'features/display-board/routes/dynamic/viewer.tsx'),
        route('/:dynamicId/edit', 'features/display-board/routes/dynamic/edit.tsx'),
        route('/:dynamicId/delete', 'features/display-board/routes/dynamic/delete.tsx'),
      ]),
      ...prefix('documents', [
        index('features/display-board/routes/documents/list.tsx'),
        route('new', 'features/display-board/routes/documents/new.tsx'),
        route('new-dynamic', 'features/display-board/routes/documents/new-dynamic.tsx'),
        route('reorder', 'features/display-board/routes/documents/reorder.tsx'),
        route('bulk-delete', 'features/display-board/routes/documents/bulk-delete.tsx'),
        route('bulk-move', 'features/display-board/routes/documents/bulk-move.tsx'),
        route('/:documentId/edit', 'features/display-board/routes/documents/edit.tsx'),
        route('/:documentId/delete', 'features/display-board/routes/documents/delete.tsx'),
        route('/:documentId/move-up', 'features/display-board/routes/documents/move-up.tsx'),
        route('/:documentId/move-down', 'features/display-board/routes/documents/move-down.tsx'),
        route('/:documentId/view', 'features/display-board/routes/documents/pdf-loader.tsx'),
        route('/:documentId/viewer', 'features/display-board/routes/documents/viewer.tsx'),
        route('/:documentId/read-status', 'features/display-board/routes/documents/read-status.tsx'),
        route('/:documentId/versions', 'features/display-board/routes/documents/versions.tsx'),
        route('/:documentId/thumbnail', 'features/display-board/routes/documents/thumbnail.tsx'),
      ]),
    ]),
    route('settings', 'features/settings/routes/_layout.tsx', [
      index('features/settings/routes/index.tsx'),
      route('general', 'features/settings/routes/general/settings.tsx'),
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
      route('audit-log', 'features/settings/routes/audit-log.tsx'),
      route('congregation', 'features/settings/routes/congregation/settings.tsx'),
      ...prefix('congregation/templates', [
        index('features/settings/routes/congregation/template-list.tsx'),
        route('new', 'features/settings/routes/congregation/templates/new.tsx'),
        ...prefix(':templateId', [
          index('features/settings/routes/congregation/templates/view.tsx'),
          route('edit', 'features/settings/routes/congregation/templates/edit.tsx'),
          route('responsible', 'features/settings/routes/congregation/templates/responsible.tsx'),
        ]),
      ]),
      route('data', 'features/settings/routes/data/settings.tsx'),
      route('data/export', 'features/settings/routes/congregation/export.tsx'),
      route('data/export/:jobId/status', 'features/settings/routes/congregation/export-status.tsx'),
      route('data/export/:jobId/download', 'features/settings/routes/congregation/export-download.tsx'),
      route('data/import', 'features/settings/routes/congregation/import.tsx'),
      route('data/import/confirm', 'features/settings/routes/congregation/import-confirm.tsx'),
      route('data/import/:jobId/status', 'features/settings/routes/congregation/import-status.tsx'),
    ]),
    route('publishers', 'features/publishers/routes/_layout.tsx', [
      index('features/publishers/routes/publishers/publisher-list.tsx'),
      route('new', 'features/publishers/routes/publishers/new-publisher.tsx'),
      ...prefix(':publisherId', [
        index('features/publishers/routes/publishers/publisher.tsx'),
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
    route('groups', 'features/publishers/routes/_layout.tsx', { id: 'groups-layout' }, [
      index('features/publishers/routes/publishers/group-list.tsx'),
      route('new', 'features/publishers/routes/publishers/new-group.tsx'),
      ...prefix(':groupId', [
        index('features/publishers/routes/publishers/group.tsx'),
        route('edit', 'features/publishers/routes/publishers/edit-group.tsx'),
        route('delete', 'features/publishers/routes/publishers/delete-group.tsx'),
      ]),
    ]),
    ...programsRoutes,
    ...territoryManagementRoutes,
    route('platform-admin', 'features/platform-admin/routes/_layout.tsx', [
      index('features/platform-admin/routes/index.tsx'),
      route('congregations', 'features/platform-admin/routes/congregations.tsx'),
      route('congregations/:congregationId/edit', 'features/platform-admin/routes/edit-congregation.tsx'),
      route('users', 'features/platform-admin/routes/users.tsx'),
    ]),
  ]),
] satisfies RouteConfig
