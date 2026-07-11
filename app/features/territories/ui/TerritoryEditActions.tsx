import { Download, MoreHorizontal, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'

export function TerritoryEditActions({ territoryId }: { territoryId: number }) {
  return (
    <>
      <Button asChild variant="outline" size="icon" title={m.territories_download_pdf_title()}>
        <a href={`/territories/territory/${territoryId}/pdf`}>
          <Download className="size-4" />
        </a>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" title={m.territories_edit_more_actions_title()}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuSeparator className="first:hidden" />
          <DropdownMenuItem asChild variant="destructive">
            <Link to={`/territories/territory/${territoryId}/delete`}>
              <Trash2 className="size-4" />
              {m.territories_delete_title_attr()}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
