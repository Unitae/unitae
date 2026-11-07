import { Permission } from '~/shared/types/permission'

/**
 * Who may enter the publishers area at all. Each page inside checks its own right; this is the
 * door, shared by the area's layout and by any page that links into it, so a link is never shown
 * to someone the door would turn away. Group overseers and assistants come in by their group,
 * without a permission, to reach their group's reports and emergency roster.
 */
export function canEnterPublishersArea(
  permissions: ReadonlySet<Permission>,
  member: { responsibleFor: { id: number } | null; deputyFor: { id: number } | null } | null,
): boolean {
  return (
    permissions.has(Permission.CanViewPublishers) ||
    permissions.has(Permission.CanViewPrograms) ||
    permissions.has(Permission.CanViewEmergencyInfo) ||
    permissions.has(Permission.CanManageEmergencyInfo) ||
    member?.responsibleFor != null ||
    member?.deputyFor != null
  )
}
