import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { TableCell, TableRow } from '~/shared/ui/table'

interface NoCoordinatesDividerProps {
  count: number
  colSpan: number
}

/**
 * In-table section divider — shown when the current page straddles the
 * boundary between geocoded rows and rows without coordinates. Reads as a
 * deliberate "section header" rather than an italic warning.
 */
export function NoCoordinatesDivider({ count, colSpan }: NoCoordinatesDividerProps) {
  return (
    <TableRow className="border-b-0 border-t-2 border-dashed border-border bg-transparent hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        <span>{m.territories_filter_no_coordinates_group_full()}</span>
        <Badge variant="secondary" className="ml-2">
          {count}
        </Badge>
      </TableCell>
    </TableRow>
  )
}

interface NoCoordinatesPageBannerProps {
  count: number
}

/**
 * Above-table banner — shown when an entire page lies past the partition
 * boundary (so the in-table divider would never appear). Tells the user they
 * are in the un-coord tail without surprise.
 */
export function NoCoordinatesPageBanner({ count }: NoCoordinatesPageBannerProps) {
  return (
    <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
      {m.territories_filter_no_coordinates_page_banner({ count: String(count) })}
    </div>
  )
}
