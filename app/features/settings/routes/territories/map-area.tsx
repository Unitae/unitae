import { redirect } from 'react-router'
import { areaFeature } from '~/features/territories'
import { getMapArea } from '~/features/territories/index.server'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import type { Route } from './+types/map-area'

// « Télécharger la zone à couvrir »: an instance without a base map hands its host the congregation's area as GeoJSON
// — the perimeter when one is drawn and holds the placed buildings, else the rectangle around both — to cut a map file
// to it.

const ACCENTS = /[̀-ͯ]/g
const UNSAFE_FILENAME = /[/\\?%*:|"<>]/g

export async function loader({ context }: Route.LoaderArgs) {
  if (!context.get(permissionsContext).has(Permission.CanConfigureTerritorySettings)) throw redirect('/')
  const mapArea = await withScopeFromContext(context, db => getMapArea(db))
  if (mapArea == null) throw redirect('/settings/territories')

  const filename =
    `${m.settings_map_tiles_area_filename({ name: context.get(congregationContext).displayName })}.geojson`
      .normalize('NFD')
      .replace(ACCENTS, '')
      .replace(UNSAFE_FILENAME, '_')
      .toLowerCase()
  return new Response(JSON.stringify(areaFeature(mapArea), null, 2), {
    headers: { 'Content-Type': 'application/geo+json', 'Content-Disposition': `attachment; filename="${filename}"` },
  })
}
