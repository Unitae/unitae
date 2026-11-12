import { Download, FileText } from 'lucide-react'
import { useState } from 'react'
import { useFetcher } from 'react-router'
import { sendState } from '~/features/events/model/our-speaker'
import type { OurListContact, OurListRecipient } from '~/features/events/model/our-speaker.type'
import { formatSpeakerDate } from '~/features/events/model/speaker-dates'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Checkbox } from '~/shared/ui/checkbox'
import { DateInput } from '~/shared/ui/DateInput'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Textarea } from '~/shared/ui/textarea'

// Sending « Notre liste », and marking it sent from someone's own mailbox. The send dialog shows exactly what goes out:
// from whom, where replies go, to whom (one e-mail per congregation), who is copied, the subject, the message, the PDF.

export const OUR_LIST_PDF = '/programs/external-speakers/ours/pdf'

interface Refusal {
  ok: false
  error: string
}
const refusalOf = (data: unknown): Refusal | null =>
  (data as { ok?: boolean } | undefined)?.ok === false ? (data as Refusal) : null

function stateOf(recipient: OurListRecipient, timezone: string): string {
  const state = sendState(recipient)
  if (state === 'never') return m.external_speakers_send_state_never()
  const date = formatSpeakerDate(recipient.sentAt ?? new Date(), timezone)
  return state === 'changed'
    ? m.external_speakers_send_state_changed({ date })
    : m.external_speakers_send_state_up_to_date({ date })
}

function useChoice(initial: number[]) {
  const [chosen, setChosen] = useState<Set<number>>(new Set(initial))
  const toggle = (id: number, on: boolean) =>
    setChosen(previous => {
      const next = new Set(previous)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  return { chosen, toggle }
}

function RecipientRow({
  recipient,
  checked,
  disabled,
  detail,
  state,
  onToggle,
}: {
  recipient: OurListRecipient
  checked: boolean
  disabled?: boolean
  detail?: string
  state: string
  onToggle: (on: boolean) => void
}) {
  const id = `recipient-${recipient.speakerCongregationId}`
  return (
    <label
      htmlFor={id}
      className="border-border flex cursor-pointer items-start gap-3 border-b px-3.5 py-2.5 text-sm last:border-b-0 has-disabled:cursor-default has-disabled:opacity-60"
    >
      <Checkbox
        id={id}
        name="speakerCongregationIds"
        value={String(recipient.speakerCongregationId)}
        checked={checked}
        disabled={disabled}
        onCheckedChange={next => onToggle(next === true)}
        className="mt-0.5"
      />
      <span className="flex min-w-0 flex-col">
        <span className="break-words">
          <span className="font-medium">{recipient.name}</span>
          {detail && <span className="text-muted-foreground"> · {detail}</span>}
        </span>
        <span className="text-faint text-xs">{state}</span>
      </span>
    </label>
  )
}

const mailbox = (name: string, email: string) => (name ? `${name} <${email}>` : email)

export function SendOurListDialog({
  recipients,
  preselected,
  responsible,
  emailFrom,
  emailEnabled,
  subject,
  message,
  filename,
  count,
  timezone,
  onOpenChange,
  onMarkInstead,
}: {
  recipients: OurListRecipient[]
  preselected: number[]
  /** Our public talk coordinator: replies go to him. */
  responsible: OurListContact | null
  emailFrom: string
  emailEnabled: boolean
  subject: string
  message: string
  filename: string
  count: number
  timezone: string
  onOpenChange: (open: boolean) => void
  /** Without e-mail on this installation: mark the chosen congregations as sent from one's own mailbox. */
  onMarkInstead: (ids: number[]) => void
}) {
  const fetcher = useFetcher()
  useCloseOnSave(fetcher, () => onOpenChange(false))
  const reachable = (recipient: OurListRecipient) => recipient.responsibleEmail.trim() !== ''
  const { chosen, toggle } = useChoice(
    preselected.filter(id => recipients.some(r => r.speakerCongregationId === id && reachable(r))),
  )
  const refusal = refusalOf(fetcher.data)
  const replyTo = responsible?.email ? mailbox(responsible.name, responsible.email) : null
  const sendLabel =
    chosen.size === 0
      ? m.external_speakers_send_choose()
      : chosen.size === 1
        ? m.external_speakers_send_one()
        : m.external_speakers_send_many({ count: String(chosen.size) })

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.external_speakers_send_title()}</DialogTitle>
          <DialogDescription>{m.external_speakers_send_description()}</DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" id="send-our-list" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="send" />
          {!emailEnabled && (
            <p className="bg-warning-soft rounded-md px-3 py-2.5 text-sm">{m.external_speakers_send_unavailable()}</p>
          )}
          {refusal && (
            <p role="alert" className="bg-danger-soft text-danger-text rounded-md px-3 py-2.5 text-sm">
              {refusal.error}
            </p>
          )}
          {emailEnabled && (
            <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">{m.external_speakers_send_from()}</dt>
              <dd className="flex flex-col break-words">
                {emailFrom}
                <span className="text-faint text-xs">{m.external_speakers_send_from_hint()}</span>
              </dd>
              <dt className="text-muted-foreground">{m.external_speakers_send_reply_to()}</dt>
              <dd className="flex flex-col break-words">
                {replyTo ?? <span className="text-warning-text">{m.external_speakers_send_reply_to_missing()}</span>}
                <span className="text-faint text-xs">
                  {replyTo ? m.external_speakers_send_reply_to_hint() : m.external_speakers_send_no_reply_to()}
                </span>
              </dd>
            </dl>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{m.external_speakers_send_to()}</span>
            <div className="border-border overflow-hidden rounded-lg border">
              {recipients.map(recipient => (
                <RecipientRow
                  key={recipient.speakerCongregationId}
                  recipient={recipient}
                  checked={chosen.has(recipient.speakerCongregationId)}
                  disabled={!reachable(recipient)}
                  detail={
                    reachable(recipient) ? mailbox(recipient.responsibleName, recipient.responsibleEmail) : undefined
                  }
                  state={
                    reachable(recipient) ? stateOf(recipient, timezone) : m.external_speakers_send_state_no_email()
                  }
                  onToggle={on => toggle(recipient.speakerCongregationId, on)}
                />
              ))}
            </div>
            {emailEnabled && (
              <Label className="mt-1 flex items-center gap-2.5 font-normal">
                <Checkbox name="copyCoordinators" />
                {m.external_speakers_send_cc()}
              </Label>
            )}
          </div>

          {emailEnabled && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="send-subject">{m.external_speakers_send_subject()}</Label>
                <Input id="send-subject" name="subject" defaultValue={subject} maxLength={200} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="send-message">{m.external_speakers_send_message()}</Label>
                <Textarea id="send-message" name="message" defaultValue={message} rows={7} required />
              </div>
            </>
          )}

          <div className="bg-sidebar flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm">
            <FileText aria-hidden="true" className="text-faint size-4 shrink-0" />
            <span className="min-w-0 flex-1 break-words">
              {filename}
              <span className="text-faint"> · {m.external_speakers_send_attachment({ count: String(count) })}</span>
            </span>
            <a
              href={`${OUR_LIST_PDF}?preview`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              {m.external_speakers_send_preview()}
            </a>
          </div>
        </fetcher.Form>
        <DialogFooter className="sm:justify-start">
          <Button variant="ghost" asChild className="sm:mr-auto">
            <a href={OUR_LIST_PDF}>
              <Download aria-hidden="true" />
              {m.external_speakers_ours_download()}
            </a>
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {m.common_cancel()}
          </Button>
          {emailEnabled ? (
            <Button type="submit" form="send-our-list" disabled={chosen.size === 0 || fetcher.state !== 'idle'}>
              {sendLabel}
            </Button>
          ) : (
            <Button type="button" onClick={() => onMarkInstead([...chosen])}>
              {m.external_speakers_ours_mark_sent()}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MarkOurListSentDialog({
  recipients,
  preselected,
  today,
  timezone,
  onOpenChange,
}: {
  recipients: OurListRecipient[]
  preselected: number[]
  /** The congregation's today, « 2026-11-11 »: the latest day a list can have been sent. */
  today: string
  timezone: string
  onOpenChange: (open: boolean) => void
}) {
  const fetcher = useFetcher()
  useCloseOnSave(fetcher, () => onOpenChange(false))
  const { chosen, toggle } = useChoice(preselected)
  const refusal = refusalOf(fetcher.data)
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.external_speakers_mark_title()}</DialogTitle>
          <DialogDescription>{m.external_speakers_mark_description()}</DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" id="mark-our-list" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="mark-sent" />
          {refusal && (
            <p role="alert" className="bg-danger-soft text-danger-text rounded-md px-3 py-2.5 text-sm">
              {refusal.error}
            </p>
          )}
          <div className="flex w-60 flex-col gap-1.5">
            <Label htmlFor="mark-date">{m.external_speakers_mark_date()}</Label>
            <DateInput id="mark-date" name="sentOn" defaultValue={today} max={today} required />
          </div>
          <div className="border-border overflow-hidden rounded-lg border">
            {recipients.map(recipient => (
              <RecipientRow
                key={recipient.speakerCongregationId}
                recipient={recipient}
                checked={chosen.has(recipient.speakerCongregationId)}
                state={stateOf(recipient, timezone)}
                onToggle={on => toggle(recipient.speakerCongregationId, on)}
              />
            ))}
          </div>
        </fetcher.Form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {m.common_cancel()}
          </Button>
          <Button type="submit" form="mark-our-list" disabled={chosen.size === 0 || fetcher.state !== 'idle'}>
            {chosen.size <= 1
              ? m.external_speakers_mark_one()
              : m.external_speakers_mark_many({ count: String(chosen.size) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
