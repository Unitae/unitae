import { Callout } from '@unitae/ui'
import { useState } from 'react'
import { useFetcher } from 'react-router'
import { type KindChangeOption, ScheduleKind, ScheduleStatus } from '~/features/events/model/schedule.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Checkbox } from '~/shared/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

/** A schedule of the meeting as the dialog lists it. */
export interface KindChangeSchedule {
  id: number
  title: string
  kind: string
  status: string
  assignments: number
}

const kindLabel = (kind: string) =>
  kind === ScheduleKind.Programme ? m.programs_schedule_kind_programme() : m.programs_schedule_kind_duty()
const unavailable = (kind: string) =>
  kind === ScheduleKind.Programme
    ? m.programs_kind_change_unavailable_programme()
    : m.programs_kind_change_unavailable_duty()
const statusLabel = (status: string) =>
  status === ScheduleStatus.Published ? m.programs_view_released() : m.programs_event_draft_badge()
// A template left unnamed reads as the catalogue's label.
const suggestionName = (suggestion: KindChangeOption['suggested'][number]) =>
  suggestion.name ??
  (suggestion.kind === ScheduleKind.Programme ? m.programs_view_spiritual_program() : m.programs_view_services())

/**
 * « Changer le type » (D40): the new kind; the meeting's schedules, all kept by default, one
 * unticked going with its assignments; the new kind's suggestions, one of a kind still kept unavailable and never
 * sent.
 */
export function KindChangeDialog({
  open,
  onClose,
  eventId,
  schedules,
  kinds,
}: {
  open: boolean
  onClose: () => void
  eventId: number
  schedules: KindChangeSchedule[]
  kinds: KindChangeOption[]
}) {
  const fetcher = useFetcher<{ ok: boolean }>()
  useCloseOnSave(fetcher, onClose)
  const [kindId, setKindId] = useState('')
  const [kept, setKept] = useState<number[]>([])
  const [added, setAdded] = useState<number[]>([])
  const [wasOpen, setWasOpen] = useState(open)
  // Each opening starts over: every schedule kept, no kind chosen.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setKindId('')
      setKept(schedules.map(schedule => schedule.id))
      setAdded([])
    }
  }
  const kind = kinds.find(option => String(option.id) === kindId)
  const heldKinds = new Set(schedules.filter(schedule => kept.includes(schedule.id)).map(schedule => schedule.kind))
  const losesPublished = schedules.some(
    schedule => !kept.includes(schedule.id) && schedule.status === ScheduleStatus.Published && schedule.assignments > 0,
  )
  const choose = (value: string) => {
    setKindId(value)
    const next = kinds.find(option => String(option.id) === value)
    // Its suggestions of a kind the meeting no longer holds come ticked, as the board shows.
    setAdded((next?.suggested ?? []).filter(suggestion => !heldKinds.has(suggestion.kind)).map(s => s.id))
  }
  const toggle = (list: number[], id: number, on: boolean) => (on ? [...list, id] : list.filter(other => other !== id))

  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <fetcher.Form method="post" action={`/programs/events/${eventId}/change-kind`} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{m.programs_kind_change_title()}</DialogTitle>
            <DialogDescription>{m.programs_kind_change_body()}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kind-change-kind">{m.programs_kind_change_new()}</Label>
            <Select value={kindId} onValueChange={choose}>
              <SelectTrigger id="kind-change-kind">
                <SelectValue placeholder={m.programs_kind_change_choose()} />
              </SelectTrigger>
              <SelectContent>
                {kinds.map(option => (
                  <SelectItem key={option.id} value={String(option.id)}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="kindId" value={kindId} />
          </div>
          {schedules.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 font-medium text-sm">{m.programs_kind_change_keep()}</legend>
              {losesPublished && <Callout tone="warning">{m.programs_kind_change_warning()}</Callout>}
              {schedules.map(schedule => (
                <CheckRow
                  key={schedule.id}
                  id={`keep-${schedule.id}`}
                  name="keep"
                  value={schedule.id}
                  checked={kept.includes(schedule.id)}
                  onChange={on => setKept(toggle(kept, schedule.id, on))}
                  title={schedule.title}
                  detail={[
                    kindLabel(schedule.kind),
                    statusLabel(schedule.status),
                    m.programs_kind_change_assignments({ count: schedule.assignments }),
                  ].join(' · ')}
                />
              ))}
            </fieldset>
          )}
          {kind && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 font-medium text-sm">{m.programs_kind_change_add()}</legend>
              {kind.suggested.length === 0 && (
                <p className="text-muted-foreground text-sm">{m.programs_kind_change_none()}</p>
              )}
              {kind.suggested.map(suggestion => {
                const held = heldKinds.has(suggestion.kind)
                return (
                  <CheckRow
                    key={suggestion.id}
                    id={`add-${suggestion.id}`}
                    name="add"
                    value={suggestion.id}
                    checked={!held && added.includes(suggestion.id)}
                    disabled={held}
                    onChange={on => setAdded(toggle(added, suggestion.id, on))}
                    title={suggestionName(suggestion)}
                    detail={
                      held
                        ? `${kindLabel(suggestion.kind)} · ${unavailable(suggestion.kind)}`
                        : kindLabel(suggestion.kind)
                    }
                  />
                )
              })}
            </fieldset>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {m.common_cancel()}
            </Button>
            <SubmitButton disabled={kind == null || fetcher.state !== 'idle'}>{m.programs_kind_change()}</SubmitButton>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  )
}

/** A ticked box posts its value; a real label, 44 px tall on a phone. */
function CheckRow({
  id,
  name,
  value,
  checked,
  disabled = false,
  onChange,
  title,
  detail,
}: {
  id: string
  name: string
  value: number
  checked: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
  title: string
  detail: string
}) {
  return (
    <div className="flex items-start gap-2.5 max-md:min-h-11">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={next => onChange(next === true)} />
      {checked && <input type="hidden" name={name} value={value} />}
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5 font-normal">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">{detail}</span>
      </Label>
    </div>
  )
}
