import { Download, MoreHorizontal, Pencil, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Form, Link, useSubmit } from 'react-router'

import type { PublisherRecord } from '~/features/publishers/server/publisher-record.queries'
import { ExportActivityDialog } from '~/features/publishers/ui/ExportActivityDialog'
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
import { formatPersonName } from '~/shared/utils/format-person-name'

import { ConfirmDialog, LeftDialog, LinkLoginDialog } from './RecordDialogs'

type DialogKind = 'inactive' | 'active' | 'left' | 'make-publisher' | 'link-login' | 'unlink-login'

interface RecordActionsProps {
  record: PublisherRecord
  rights: {
    canEdit: boolean
    canManageLifecycle: boolean
    canManageLogin: boolean
    canDownloadS21: boolean
    isSelf: boolean
  }
  s21: { years: number[]; defaultYear: number }
  /** Today in the congregation's zone, the latest a departure can be dated. */
  today: string
  /** The earliest a departure can be dated. */
  earliestDeparture: string
  retentionMonths: number
}

/**
 * The record's actions in the top bar, in words: the S-21, « Modifier », and « … » for the person's status and login.
 * Someone who left, or is not yet a publisher, gets their way back as the main button instead.
 */
export function RecordActions({ record, rights, s21, today, earliestDeparture, retentionMonths }: RecordActionsProps) {
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const submit = useSubmit()
  const name = formatPersonName(record)
  const base = `/publishers/${record.id}`
  const close = () => setDialog(null)
  const post = (action: string) => {
    close()
    submit(null, { method: 'post', action: `${base}/${action}` })
  }
  const canChangeStatus = rights.canManageLifecycle && !rights.isSelf
  const active = record.isPublisher && record.leftAt == null
  const hasMenu = (rights.canManageLifecycle && active) || rights.canManageLogin

  return (
    <>
      {rights.canDownloadS21 && record.isPublisher && (
        <>
          <Button variant="ghost" onClick={() => setExportOpen(true)}>
            <Download />
            {m.publishers_record_s21()}
          </Button>
          <ExportActivityDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            availableYears={s21.years}
            defaultYear={s21.defaultYear}
            publisherId={record.id}
          />
        </>
      )}
      {rights.canEdit && (
        <Button asChild variant="outline">
          <Link to={`${base}/edit`}>
            <Pencil />
            {m.publishers_record_edit()}
          </Link>
        </Button>
      )}
      {canChangeStatus && record.leftAt != null && (
        <Form method="post" action={`${base}/mark-as-returned`}>
          <Button type="submit" variant="outline">
            <RotateCcw />
            {m.publishers_view_mark_as_returned_title()}
          </Button>
        </Form>
      )}
      {canChangeStatus && record.leftAt == null && !record.isPublisher && (
        <Button onClick={() => setDialog('make-publisher')}>
          {record.isMale === false ? m.publishers_record_make_publisher_f() : m.publishers_record_make_publisher()}
        </Button>
      )}
      {hasMenu && (
        <RecordMoreMenu
          record={record}
          rights={rights}
          name={name}
          showStatus={rights.canManageLifecycle && active}
          onOpen={setDialog}
        />
      )}

      <ConfirmDialog
        open={dialog === 'inactive'}
        onClose={close}
        title={m.publishers_view_mark_as_inactive_dialog_title()}
        description={m.publishers_view_mark_as_inactive_dialog_description()}
        confirm={m.publishers_view_mark_as_inactive_confirm()}
        onConfirm={() => post('mark-as-inactive')}
      />
      <ConfirmDialog
        open={dialog === 'active'}
        onClose={close}
        title={m.publishers_view_mark_as_active_dialog_title()}
        description={m.publishers_view_mark_as_active_dialog_description()}
        confirm={m.publishers_view_mark_as_active_confirm()}
        onConfirm={() => post('mark-as-active')}
      />
      <ConfirmDialog
        open={dialog === 'make-publisher'}
        onClose={close}
        title={m.publishers_view_make_publisher_dialog_title()}
        description={m.publishers_view_make_publisher_dialog_description()}
        confirm={m.publishers_view_make_publisher_confirm()}
        onConfirm={() => post('make-publisher')}
      />
      <ConfirmDialog
        open={dialog === 'unlink-login'}
        onClose={close}
        title={m.publishers_edit_unlink_login_dialog_title()}
        description={m.publishers_edit_unlink_login_dialog_description()}
        confirm={m.publishers_edit_unlink_login_submit()}
        destructive
        onConfirm={() => post('unlink-login')}
      />
      <LeftDialog
        open={dialog === 'left'}
        onClose={close}
        record={record}
        action={`${base}/mark-as-left`}
        today={today}
        earliest={earliestDeparture}
        retentionMonths={retentionMonths}
      />
      <LinkLoginDialog
        open={dialog === 'link-login'}
        onClose={close}
        action={`${base}/link-login`}
        defaultEmail={record.email}
      />
    </>
  )
}

interface RecordMoreMenuProps {
  record: PublisherRecord
  rights: RecordActionsProps['rights']
  name: string
  showStatus: boolean
  onOpen: (dialog: DialogKind) => void
}

/** « … »: the person's status and their login, each opening its own confirmation. */
function RecordMoreMenu({ record, rights, name, showStatus, onOpen }: RecordMoreMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={m.publishers_record_more_actions({ name })}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {showStatus && (
          <>
            <DropdownMenuLabel className="font-medium text-faint text-xs">
              {m.publishers_record_menu_status()}
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={rights.isSelf}
              onSelect={() => onOpen(record.inactiveAt ? 'active' : 'inactive')}
            >
              {record.inactiveAt
                ? m.publishers_view_mark_as_active_title()
                : m.publishers_view_mark_as_inactive_title()}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={rights.isSelf} onSelect={() => onOpen('left')}>
              {m.publishers_record_menu_left()}
            </DropdownMenuItem>
            {rights.isSelf && <p className="px-2 pb-1.5 text-faint text-xs">{m.publishers_record_menu_self()}</p>}
          </>
        )}
        {rights.canManageLogin && (
          <>
            {showStatus && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="font-medium text-faint text-xs">
              {m.publishers_record_login()}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => onOpen(record.login ? 'unlink-login' : 'link-login')}>
              {record.login ? m.publishers_record_menu_unlink() : m.publishers_record_menu_link()}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
