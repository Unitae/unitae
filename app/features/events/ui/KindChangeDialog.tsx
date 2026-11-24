import { Callout } from '@unitae/ui'
import { useState } from 'react'
import { useFetcher } from 'react-router'
import { type KindChangeOption, ScheduleKind, ScheduleStatus } from '~/features/events/model/schedule.type'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Checkbox } from '~/shared/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { scheduleTitle } from './ScheduleHeading'

/** A schedule of the meeting as the dialog lists it. */
export interface KindChangeSchedule {
  id: number
  title: string
  kind: string
  status: string
  assignments: number
  /** Whether the reader may remove it (canChangeSchedule): one they may not stays kept. */
  removable: boolean
}

const kindLabel = (kind: string) =>
  kind === ScheduleKind.Programme ? m.programs_schedule_kind_programme() : m.programs_schedule_kind_duty()
// The kind beside a title, unless the title already says it (an unnamed services schedule reads « Services »).
const kindUnlessTitled = (title: string, kind: string) => (kindLabel(kind) === title ? [] : [kindLabel(kind)])
const unavailable = (kind: string) =>
  kind === ScheduleKind.Programme
    ? m.programs_kind_change_unavailable_programme()
    : m.programs_kind_change_unavailable_duty()
const statusLabel = (status: string) =>
  status === ScheduleStatus.Published ? m.programs_view_released() : m.programs_event_draft_badge()

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
  hasAttendance,
}: {
  open: boolean
  onClose: () => void
  eventId: number
  schedules: KindChangeSchedule[]
  kinds: KindChangeOption[]
  /** Its attendance counts follow the kind on the S-88: said before the change. */
  hasAttendance: boolean
}) {
  const fetcher = useFetcher<{ ok: boolean }>()
  useCloseOnSave(fetcher, onClose)
  const [kindId, setKindId] = useState('')
  // The schedules unticked: one the page shows since opening (added in another tab) arrives kept, never removed.
  const [removed, setRemoved] = useState<number[]>([])
  const [added, setAdded] = useState<number[]>([])
  const [wasOpen, setWasOpen] = useState(open)
  // Each opening starts over: nothing unticked, no kind chosen.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setKindId('')
      setRemoved([])
      setAdded([])
    }
  }
  const kind = kinds.find(option => String(option.id) === kindId)
  const isKept = (id: number) => !removed.includes(id)
  const heldKinds = new Set(schedules.filter(schedule => isKept(schedule.id)).map(schedule => schedule.kind))
  const losesPublished = schedules.some(
    schedule => !isKept(schedule.id) && schedule.status === ScheduleStatus.Published && schedule.assignments > 0,
  )
  const choose = (value: string) => {
    setKindId(value)
    const next = kinds.find(option => String(option.id) === value)
    // Its suggestions of a kind the meeting no longer holds come ticked, as the board shows.
    setAdded((next?.suggested ?? []).filter(suggestion => !heldKinds.has(suggestion.kind)).map(s => s.id))
  }
  const toggle = (list: number[], id: number, on: boolean) => (on ? [...list, id] : list.filter(other => other !== id))
  // Unticking a schedule ticks the new kind's suggestion of its kind, which takes its place (the user's choice).
  const keep = (schedule: KindChangeSchedule, on: boolean) => {
    setRemoved(toggle(removed, schedule.id, !on))
    const replacing = (kind?.suggested ?? []).filter(suggestion => suggestion.kind === schedule.kind)
    if (!on) setAdded([...new Set([...added, ...replacing.map(suggestion => suggestion.id)])])
  }

  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <fetcher.Form method="post" action={`/programs/events/${eventId}/change-kind`} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{m.programs_kind_change_title()}</DialogTitle>
            <DialogDescription>{m.programs_kind_change_body()}</DialogDescription>
          </DialogHeader>
          {hasAttendance && <Callout tone="info">{m.programs_kind_change_attendance()}</Callout>}
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
                  // Every schedule listed is sent, kept or removed: one the dialog never showed is never removed.
                  uncheckedName="remove"
                  value={schedule.id}
                  checked={isKept(schedule.id)}
                  disabled={!schedule.removable}
                  onChange={on => keep(schedule, on)}
                  title={schedule.title}
                  detail={[
                    ...kindUnlessTitled(schedule.title, schedule.kind),
                    statusLabel(schedule.status),
                    m.programs_kind_change_assignments({ count: schedule.assignments }),
                    ...(schedule.removable ? [] : [m.programs_kind_change_not_yours()]),
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
                    title={scheduleTitle(suggestion)}
                    detail={[
                      ...kindUnlessTitled(scheduleTitle(suggestion), suggestion.kind),
                      ...(suggestion.responsible ? [getRoleDisplayName(suggestion.responsible)] : []),
                      ...(held ? [unavailable(suggestion.kind)] : []),
                    ].join(' · ')}
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

/** A ticked box posts its value under `name`, an unticked one under `uncheckedName`; a real label, 44 px on a phone. */
function CheckRow({
  id,
  name,
  value,
  checked,
  disabled = false,
  onChange,
  title,
  detail,
  uncheckedName,
}: {
  id: string
  name: string
  /** The field an unticked box posts its value under, if any. */
  uncheckedName?: string
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
      {!checked && uncheckedName && <input type="hidden" name={uncheckedName} value={value} />}
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5 font-normal">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">{detail}</span>
      </Label>
    </div>
  )
}
