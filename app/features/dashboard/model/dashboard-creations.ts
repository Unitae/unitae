import { Permission } from '~/shared/types/permission'

import type { DashboardVisibility } from './dashboard-visibility'

export type CreationKey = 'absence' | 'attribution' | 'programme' | 'publisher' | 'board-document' | 'role'

/** One thing « Nouveau » offers to create, and the page that creates it. */
export interface Creation {
  key: CreationKey
  to: string
}

/**
 * What the dashboard's « Nouveau » offers: the creations the viewer may make, in the order of a week's work. They
 * follow the dashboard's own visibility, so the menu never links to a page that would send the viewer back.
 */
export function dashboardCreations(visibility: DashboardVisibility, permissions: ReadonlySet<Permission>): Creation[] {
  const offers: [allowed: boolean, creation: Creation][] = [
    [visibility.personal, { key: 'absence', to: '/me/days-off/new' }],
    [
      visibility.territories?.canAssign === true,
      { key: 'attribution', to: '/territories/attributions/new/available-territories' },
    ],
    [visibility.programmes?.canCreate === true, { key: 'programme', to: '/programs/new' }],
    [visibility.roll?.canCreate === true, { key: 'publisher', to: '/publishers/new' }],
    [visibility.documents?.canUpload === true, { key: 'board-document', to: '/board/documents/new' }],
    [permissions.has(Permission.CanManageRoles), { key: 'role', to: '/congregation/roles/organigram?new=1' }],
  ]
  return offers.flatMap(([allowed, creation]) => (allowed ? [creation] : []))
}
