import { Download, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Link, useFetcher } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { SubmitButton } from '~/shared/ui/SubmitButton'

/** The territory a menu or the delete dialog acts on. */
export interface TerritoryTarget {
  id: number
  number: string
  /** Attributed at least once: it cannot be deleted. */
  hasHistory: boolean
  entrances: number
}

interface TerritoryMenuProps {
  territory: TerritoryTarget
  canManage: boolean
  /** The PDF and « Modifier » show in the top bar of the territory's page: the menu leaves them out there. */
  compact?: boolean
  onDelete: (territory: TerritoryTarget) => void
}

/**
 * « … » of a territory: its PDF, « Modifier », and « Supprimer… », greyed out with the reason once it was
 * attributed — its history counts for the S-13.
 */
export function TerritoryMenu({ territory, canManage, compact = false, onDelete }: TerritoryMenuProps) {
  if (compact && !canManage) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact ? 'icon' : 'icon-sm'}
          aria-label={m.territories_menu_label({ number: territory.number })}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {!compact && (
          <DropdownMenuItem asChild>
            <a href={`/territories/territory/${territory.id}/pdf`}>
              <Download aria-hidden="true" />
              {m.territories_menu_pdf()}
            </a>
          </DropdownMenuItem>
        )}
        {!compact && canManage && (
          <DropdownMenuItem asChild>
            <Link to={`/territories/territory/${territory.id}/edit`}>
              <Pencil aria-hidden="true" />
              {m.territories_menu_edit()}
            </Link>
          </DropdownMenuItem>
        )}
        {canManage && (
          <>
            {!compact && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={territory.hasHistory}
              variant="destructive"
              onSelect={() => onDelete(territory)}
            >
              <Trash2 aria-hidden="true" />
              {m.territories_menu_delete()}
              {territory.hasHistory && (
                <span className="ml-auto text-faint text-xs">{m.territories_menu_delete_history()}</span>
              )}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface DeleteTerritoryDialogProps {
  territory: TerritoryTarget | null
  onOpenChange: (open: boolean) => void
}

/** Deletes a territory never attributed; its entrances become free for another territory. */
export function DeleteTerritoryDialog({ territory, onOpenChange }: DeleteTerritoryDialogProps) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>()
  const error = fetcher.data?.error
  useCloseOnSave(fetcher, () => onOpenChange(false))

  return (
    <AlertDialog open={territory != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {territory && (
          <fetcher.Form
            method="post"
            action={`/territories/territory/${territory.id}/delete`}
            className="flex flex-col gap-4"
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{m.territories_delete_dialog_title({ number: territory.number })}</AlertDialogTitle>
              <AlertDialogDescription>
                {territory.entrances > 0
                  ? territory.entrances === 1
                    ? m.territories_delete_dialog_body_one()
                    : m.territories_delete_dialog_body({ count: territory.entrances })
                  : m.territories_delete_dialog_body_empty()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && (
              <p role="alert" className="text-danger-text text-sm">
                {error}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel type="button">{m.common_cancel()}</AlertDialogCancel>
              <SubmitButton variant="destructive" disabled={fetcher.state !== 'idle'}>
                <Trash2 aria-hidden="true" />
                {m.territories_delete_dialog_confirm({ number: territory.number })}
              </SubmitButton>
            </AlertDialogFooter>
          </fetcher.Form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
