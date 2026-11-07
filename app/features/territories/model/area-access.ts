import { Permission } from '~/shared/types/permission'

/**
 * Who may enter the territories area at all (attributions live inside it). Shared by the area's
 * layout and by any page that links into it, so a link is never shown to someone the door would
 * turn away.
 */
export function canEnterTerritoriesArea(permissions: ReadonlySet<Permission>): boolean {
  return permissions.has(Permission.CanViewTerritories) || permissions.has(Permission.CanViewProspection)
}
