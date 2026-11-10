import { Panel, SectionHeading } from '@unitae/ui'
import { Copy, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
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
import { Input } from '~/shared/ui/input'
import { SettingRow } from '~/shared/ui/SettingRow'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { formatRelativeTime } from '~/shared/utils/relative-time'

export interface CalendarFeed {
  url: string
  lastUsedAt: string | Date | null
}

type Confirm = 'change' | 'delete' | null

/**
 * « Agenda »: the private link a calendar app subscribes to, to copy; changing or deleting it asks first, since
 * every subscribed calendar stops receiving anything.
 */
export function CalendarFeedPanel({ calendar }: { calendar: CalendarFeed | null }) {
  const [confirm, setConfirm] = useState<Confirm>(null)
  const create = useFetcher()

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast(m.account_calendar_copied())
    } catch {
      // Clipboard refused: the link stays selectable in its field.
    }
  }

  return (
    // Anchored so the dashboard's calendar prompt lands here.
    <section id="calendar-feed" aria-labelledby="account-calendar" className="scroll-mt-20">
      <SectionHeading id="account-calendar" title={m.account_calendar_title()} />
      {calendar == null ? (
        <Panel>
          <SettingRow title={m.account_calendar_none_title()} description={m.account_calendar_none_description()}>
            <create.Form method="post" action="/me/calendar-feed/regenerate">
              <SubmitButton className="max-sm:h-11 max-sm:w-full">{m.account_calendar_create()}</SubmitButton>
            </create.Form>
          </SettingRow>
        </Panel>
      ) : (
        <Panel>
          <div className="flex flex-col gap-2.5 px-4.5 py-4">
            <p className="text-muted-foreground text-sm leading-relaxed">{m.account_calendar_description()}</p>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                readOnly={true}
                value={calendar.url}
                aria-label={m.account_calendar_link_label()}
                onFocus={event => event.currentTarget.select()}
                className="min-w-0 flex-1 font-mono text-muted-foreground text-xs"
              />
              <Button type="button" variant="outline" onClick={() => copy(calendar.url)}>
                <Copy aria-hidden="true" />
                {m.account_calendar_copy()}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label={m.account_calendar_menu()}>
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <DropdownMenuItem onSelect={() => setConfirm('change')}>
                    <RefreshCw aria-hidden="true" />
                    {m.account_calendar_change()}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('delete')}>
                    <Trash2 aria-hidden="true" />
                    {m.account_calendar_delete()}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <span className="text-faint text-sm">
              {calendar.lastUsedAt
                ? m.account_calendar_last_read({ when: formatRelativeTime(calendar.lastUsedAt, getLocale()) })
                : m.account_calendar_never_read()}
            </span>
          </div>
          <p className="border-t px-4.5 py-3 text-faint text-sm leading-relaxed">{m.account_calendar_private()}</p>
        </Panel>
      )}
      <CalendarConfirmDialog confirm={confirm} onOpenChange={open => !open && setConfirm(null)} />
    </section>
  )
}

function CalendarConfirmDialog({ confirm, onOpenChange }: { confirm: Confirm; onOpenChange: (open: boolean) => void }) {
  const fetcher = useFetcher<{ ok?: boolean }>()
  useCloseOnSave(fetcher, () => onOpenChange(false))
  const deleting = confirm === 'delete'

  return (
    <AlertDialog open={confirm != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <fetcher.Form
          method="post"
          action={deleting ? '/me/calendar-feed/revoke' : '/me/calendar-feed/regenerate'}
          className="flex flex-col gap-4"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting ? m.account_calendar_delete_title() : m.account_calendar_change_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? m.account_calendar_delete_body() : m.account_calendar_change_body()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{m.common_cancel()}</AlertDialogCancel>
            <SubmitButton variant={deleting ? 'destructive' : 'default'}>
              {deleting ? m.account_calendar_delete_confirm() : m.account_calendar_change_confirm()}
            </SubmitButton>
          </AlertDialogFooter>
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
