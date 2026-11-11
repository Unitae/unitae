import { IdCard, MoreHorizontal, Trash2, UserPlus, UserX } from 'lucide-react'
import { useState } from 'react'
import { Link, useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { ConfirmDialog } from './ConfirmDialog'

export interface AccountActionRights {
  viewRecord: boolean
  createRecord: boolean
  makePublisher: boolean
  anonymise: boolean
  delete: boolean
}

interface AccountActionsProps {
  account: { id: number; memberId: number | null }
  rights: AccountActionRights
  isSelf: boolean
}

/** The record (to see it, or to create it), then the « … » menu of what cannot be undone, each asking first. */
export function AccountActions({ account, rights, isSelf }: AccountActionsProps) {
  const fetcher = useFetcher()
  const [pending, setPending] = useState<'anonymise' | 'delete' | null>(null)
  const menu = rights.makePublisher || rights.anonymise || rights.delete

  return (
    <>
      {rights.viewRecord && account.memberId != null && (
        <Button asChild variant="outline" size="sm">
          <Link to={`/publishers/${account.memberId}/view`}>
            <IdCard aria-hidden="true" />
            {m.settings_account_view_record()}
          </Link>
        </Button>
      )}
      {rights.createRecord && account.memberId == null && (
        <Button asChild variant="outline" size="sm">
          <Link to={`/settings/users/${account.id}/add-to-congregation`}>
            <UserPlus aria-hidden="true" />
            {m.settings_account_create_record()}
          </Link>
        </Button>
      )}
      {menu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={m.common_more_actions()}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-72">
            {rights.makePublisher && (
              <DropdownMenuItem
                onSelect={() =>
                  fetcher.submit(null, { method: 'post', action: `/settings/users/${account.id}/make-publisher` })
                }
              >
                <UserPlus />
                {m.settings_account_make_publisher()}
              </DropdownMenuItem>
            )}
            {rights.makePublisher && (rights.anonymise || rights.delete) && <DropdownMenuSeparator />}
            {rights.anonymise && (
              <DropdownMenuItem variant="destructive" disabled={isSelf} onSelect={() => setPending('anonymise')}>
                <UserX />
                {m.settings_account_anonymise()}
              </DropdownMenuItem>
            )}
            {rights.delete && (
              <DropdownMenuItem variant="destructive" disabled={isSelf} onSelect={() => setPending('delete')}>
                <Trash2 />
                {m.settings_account_delete()}
              </DropdownMenuItem>
            )}
            {isSelf && (rights.anonymise || rights.delete) && (
              <DropdownMenuLabel className="font-normal text-faint text-xs">
                {m.settings_account_own_menu()}
              </DropdownMenuLabel>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ConfirmDialog
        open={pending === 'anonymise'}
        onOpenChange={open => !open && setPending(null)}
        title={m.settings_user_edit_anonymize_dialog_title()}
        description={m.settings_user_edit_anonymize_dialog_description()}
        confirmLabel={m.settings_user_edit_anonymize_confirm()}
        destructive
        onConfirm={() => fetcher.submit(null, { method: 'post', action: `/settings/users/${account.id}/anonymize` })}
      />
      <ConfirmDialog
        open={pending === 'delete'}
        onOpenChange={open => !open && setPending(null)}
        title={m.settings_user_edit_delete_account_dialog_title()}
        description={m.settings_user_edit_delete_account_dialog_description()}
        confirmLabel={m.settings_user_edit_delete_account_confirm()}
        destructive
        onConfirm={() =>
          fetcher.submit(null, { method: 'post', action: `/settings/users/${account.id}/delete-account` })
        }
      />
    </>
  )
}
