import { CircleStop, ListFilter, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Form, Link } from 'react-router'

import { formatCampaignDay } from '~/features/territories/model/campaign-days'
import {
  CampaignRegularEndAction,
  CampaignRegularStartAction,
} from '~/features/territories/model/campaign-lifecycle.type'
import type { CampaignStatus } from '~/features/territories/model/campaign-status'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { SubmitButton } from '~/shared/ui/SubmitButton'

interface CampaignActionsProps {
  campaign: {
    id: number
    name: string
    endDay: string
    restDays: number
    startRegularAction: string
    endCloseCampaign: boolean
    endRegularAction: string
  }
  status: CampaignStatus
  /** Campaign attributions still out, and regular ones it keeps paused: what ending it now does. */
  outCount: number
  pausedCount: number
  canAssign: boolean
  canDelete: boolean
}

/**
 * The campaign's actions in the top bar: edit it, attribute a territory while it runs, and in « … » the rare ones —
 * ending it before its date, deleting one that has no attribution — each after saying what it does.
 */
export function CampaignActions({
  campaign,
  status,
  outCount,
  pausedCount,
  canAssign,
  canDelete,
}: CampaignActionsProps) {
  const [confirm, setConfirm] = useState<'end' | 'delete' | null>(null)
  const base = `/territories/attributions/campaigns/${campaign.id}`
  const close = () => setConfirm(null)

  return (
    <>
      <Button asChild variant="outline" size="sm">
        <Link to={`${base}/edit`}>
          <Pencil aria-hidden="true" />
          {m.campaigns_edit_button()}
        </Link>
      </Button>
      {status === 'active' && canAssign && (
        <Button asChild size="sm">
          <Link to="/territories/attributions/new/available-territories">
            <Plus aria-hidden="true" />
            {m.attributions_assign_button()}
          </Link>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={m.common_more_actions()}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to={`/territories/attributions?campaign=${campaign.id}`}>
              <ListFilter aria-hidden="true" />
              {m.campaigns_view_in_attributions()}
            </Link>
          </DropdownMenuItem>
          {status === 'active' && (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('end')}>
              <CircleStop aria-hidden="true" />
              {m.campaigns_end_now_menu()}
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('delete')}>
              <Trash2 aria-hidden="true" />
              {m.campaigns_delete_menu()}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm === 'end'} onOpenChange={open => !open && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.campaigns_end_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.campaigns_end_body({ date: formatCampaignDay(campaign.endDay) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex list-disc flex-col gap-1 rounded-md bg-sidebar py-2.5 pr-3 pl-7 text-sm">
            {endConsequences(campaign, outCount, pausedCount).map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <Form method="post" action={base} onSubmit={close}>
              <input type="hidden" name="intent" value="end" />
              <SubmitButton variant="destructive" className="w-full">
                {m.campaigns_end_now_button()}
              </SubmitButton>
            </Form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === 'delete'} onOpenChange={open => !open && close()}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{m.campaigns_delete_dialog_title({ name: campaign.name })}</AlertDialogTitle>
            <AlertDialogDescription>{m.campaigns_delete_dialog_body()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <Form method="post" action={`${base}/delete`}>
              <SubmitButton variant="destructive" className="w-full">
                <Trash2 aria-hidden="true" />
                {m.common_delete()}
              </SubmitButton>
            </Form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** What ending the campaign now does, in the order it happens, with the numbers it touches. */
function endConsequences(campaign: CampaignActionsProps['campaign'], out: number, paused: number): string[] {
  const lines: string[] = []
  const plural = (count: number, one: () => string, other: () => string) => (count > 1 ? other() : one())
  if (out > 0) {
    lines.push(
      campaign.endCloseCampaign
        ? plural(
            out,
            () => m.campaigns_end_item_return_one({ count: out }),
            () => m.campaigns_end_item_return_other({ count: out }),
          )
        : plural(
            out,
            () => m.campaigns_end_item_stay_one({ count: out }),
            () => m.campaigns_end_item_stay_other({ count: out }),
          ),
    )
  }
  if (paused > 0 && campaign.startRegularAction === CampaignRegularStartAction.Pause) {
    const [one, other] =
      campaign.endRegularAction === CampaignRegularEndAction.Resume
        ? [m.campaigns_end_item_resume_one, m.campaigns_end_item_resume_other]
        : campaign.endRegularAction === CampaignRegularEndAction.KeepPaused
          ? [m.campaigns_end_item_keep_one, m.campaigns_end_item_keep_other]
          : [m.campaigns_end_item_close_one, m.campaigns_end_item_close_other]
    lines.push(
      plural(
        paused,
        () => one({ count: paused }),
        () => other({ count: paused }),
      ),
    )
  }
  const rest = campaign.restDays
  lines.push(
    plural(
      rest,
      () => m.campaigns_end_item_rest_one({ count: rest }),
      () => m.campaigns_end_item_rest_other({ count: rest }),
    ),
  )
  return lines
}
