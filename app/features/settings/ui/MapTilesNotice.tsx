import { Status } from '@unitae/ui'
import { Download } from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

const MAPS_DOC = 'https://github.com/Unitae/unitae/blob/main/docs/self-hosting/maps.md'

/**
 * On an instance without a base map, for whoever configures the territories: the maps are hidden, and the file to
 * hand the host so they can add one cut to the congregation's area. Publishers are told nothing — they can't act.
 */
export function MapTilesNotice({ hasArea }: { hasArea: boolean }) {
  return (
    <div className="flex flex-col gap-2 border-t px-4 py-3">
      <span className="text-sm font-medium">{m.settings_map_tiles_title()}</span>
      <Status tone="neutral" className="text-foreground">
        {m.settings_map_tiles_missing()}
      </Status>
      <p className="text-muted-foreground text-sm">{m.settings_map_tiles_missing_description()}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {hasArea ? (
          <Button variant="outline" size="sm" asChild>
            <a href="/settings/territories/map-area.geojson">
              <Download aria-hidden="true" />
              {m.settings_map_tiles_download_area()}
            </a>
          </Button>
        ) : (
          <span className="text-faint text-sm">{m.settings_map_tiles_no_area()}</span>
        )}
        <a href={MAPS_DOC} target="_blank" rel="noreferrer" className="text-primary text-sm hover:underline">
          {m.settings_map_tiles_docs()}
        </a>
      </div>
    </div>
  )
}
