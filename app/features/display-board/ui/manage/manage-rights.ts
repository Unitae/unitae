import type { ManagedItem } from '~/features/display-board/server/board-management.queries'

export interface ManageRights {
  canUpload: boolean
  canReview: boolean
  canOrganise: boolean
  canConfigureSections: boolean
  canManageDynamic: boolean
}

export const itemKey = (item: Pick<ManagedItem, 'kind' | 'id'>) => `${item.kind}-${item.id}`

/** Each action behind the right its page checks: an uploader edits only the PDFs they uploaded. */
export function canEditItem(item: ManagedItem, rights: ManageRights): boolean {
  if (item.kind === 'dynamic') return rights.canManageDynamic
  return rights.canReview || (rights.canUpload && item.ownedByUser)
}

/** « À la une » is a field the edit form shows to reviewers only, never to the PDF's uploader. */
export function canHighlightItem(item: Pick<ManagedItem, 'kind'>, rights: ManageRights): boolean {
  return item.kind === 'pdf' ? rights.canReview : rights.canManageDynamic
}

export function itemPaths(item: Pick<ManagedItem, 'kind' | 'id'>) {
  const base = item.kind === 'pdf' ? `/board/documents/${item.id}` : `/board/dynamic/${item.id}`
  return { view: `${base}/viewer`, edit: `${base}/edit`, remove: `${base}/delete`, versions: `${base}/versions` }
}
