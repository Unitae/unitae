import { Permission } from '~/shared/types/permission'

/**
 * Where a page about one member (pastoral visit, emergency information) goes back to. For a member
 * in a group: the group page when it opened this one (`?from=group`), or when the viewer may not
 * open publisher records (typically the group's overseer). Otherwise the publisher's record, or
 * home for a viewer who may not open it.
 */
export function memberBackPath(
  request: Request,
  permissions: Set<Permission>,
  member: { id: number; publisherGroupId: number | null },
): string {
  const canViewRecord = permissions.has(Permission.CanViewPublishers)
  const fromGroup = new URL(request.url).searchParams.get('from') === 'group'
  const groupId = member.publisherGroupId
  if (groupId != null && (fromGroup || !canViewRecord)) return `/groups/${groupId}/view`
  if (canViewRecord) return `/publishers/${member.id}/view`
  return '/'
}

/**
 * Where an old emergency or visit link now leads: the member's record with that panel open, or their group's page with
 * it open for them, whichever `memberBackPath` picks; home, with nothing to open, when neither is the reader's.
 */
export function memberPanelPath(
  request: Request,
  permissions: Set<Permission>,
  member: { id: number; publisherGroupId: number | null },
  panel: 'emergency' | 'visit',
): string {
  const back = memberBackPath(request, permissions, member)
  if (back.startsWith('/groups/')) return `${back}?${panel}=${member.id}`
  if (back.startsWith('/publishers/')) return `${back}?panel=${panel}`
  return back
}
