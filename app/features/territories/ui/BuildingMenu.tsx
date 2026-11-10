import { Ban, ClipboardList, Eye, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Link, useFetcher } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'

interface BuildingMenuProps {
  building: { id: number; number: string; street: string; active: boolean }
  canSurvey: boolean
  canManage: boolean
  /** The survey's address, with the list it was opened from. */
  surveyTo: string
}

/** « … » of a building: view it, survey it, and, for who manages buildings, edit its address, deactivate or delete it. */
export function BuildingMenu({ building, canSurvey, canManage, surveyTo }: BuildingMenuProps) {
  const fetcher = useFetcher()
  const base = `/territories/building/${building.id}`
  const toggle = building.active ? 'disable' : 'enable'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={m.prospection_actions_for({ address: `${building.number} ${building.street}` })}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem asChild>
          <Link to={`${base}/view`}>
            <Eye aria-hidden="true" />
            {m.prospection_action_view()}
          </Link>
        </DropdownMenuItem>
        {canSurvey && (
          <DropdownMenuItem asChild>
            <Link to={surveyTo}>
              <ClipboardList aria-hidden="true" />
              {m.prospection_action_survey()}
            </Link>
          </DropdownMenuItem>
        )}
        {canManage && (
          <>
            <DropdownMenuItem asChild>
              <Link to={`${base}/edit`}>
                <Pencil aria-hidden="true" />
                {m.prospection_action_edit_address()}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => fetcher.submit(null, { method: 'post', action: `${base}/${toggle}` })}>
              {building.active ? <Ban aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
              {building.active ? m.prospection_action_disable() : m.prospection_action_enable()}
            </DropdownMenuItem>
            <DropdownMenuItem asChild variant="destructive">
              <Link to={`${base}/delete`}>
                <Trash2 aria-hidden="true" />
                {m.prospection_action_delete()}
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
