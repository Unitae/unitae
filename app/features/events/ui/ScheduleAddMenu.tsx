import { Callout, SegmentedControl } from '@unitae/ui'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useFetcher } from 'react-router'
import { type ScheduleAddOption, type ScheduleAddOptions, ScheduleKind } from '~/features/events/model/schedule.type'
import { SCHEDULE_NAME_MAX } from '~/features/events/schemas/schedule-name.schema'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'

const kindLabel = (kind: string) =>
  kind === ScheduleKind.Programme ? m.programs_schedule_kind_programme() : m.programs_schedule_kind_duty()
// A template left unnamed reads as the catalogue's label.
const optionName = (option: ScheduleAddOption) =>
  option.name ??
  (option.kind === ScheduleKind.Programme ? m.programs_view_spiritual_program() : m.programs_view_services())

/**
 * « Ajouter un planning » (D39): the schedule templates of a kind the meeting lacks that the reader
 * may add, those its kind suggests first, then the others; « Planning vide… » for « Gérer ».
 */
export function ScheduleAddMenu({
  eventId,
  eventKindName,
  options,
}: {
  eventId: number
  eventKindName: string | null
  options: ScheduleAddOptions
}) {
  const fetcher = useFetcher<{ ok: boolean }>()
  const [empty, setEmpty] = useState(false)
  const action = `/programs/events/${eventId}/schedules/add`
  const add = (option: ScheduleAddOption) =>
    fetcher.submit({ scheduleTemplateId: String(option.id) }, { method: 'POST', action })
  const item = (option: ScheduleAddOption) => (
    <DropdownMenuItem key={option.id} onSelect={() => add(option)} className="flex-col items-start gap-0">
      <span className="font-medium">{optionName(option)}</span>
      <span className="text-muted-foreground text-xs">{[kindLabel(option.kind), ...option.usedBy].join(' · ')}</span>
    </DropdownMenuItem>
  )
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={fetcher.state !== 'idle'}>
            <Plus />
            {m.programs_schedule_add()}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          {options.suggested.length > 0 && (
            <>
              <DropdownMenuLabel>
                {eventKindName
                  ? m.programs_schedule_add_suggested({ kind: eventKindName })
                  : m.programs_schedule_add_others()}
              </DropdownMenuLabel>
              {options.suggested.map(item)}
            </>
          )}
          {options.others.length > 0 && (
            <>
              {options.suggested.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{m.programs_schedule_add_others()}</DropdownMenuLabel>
              {options.others.map(item)}
            </>
          )}
          {options.emptyKinds.length > 0 && (
            <>
              {(options.suggested.length > 0 || options.others.length > 0) && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={() => setEmpty(true)} className="flex-col items-start gap-0">
                <span className="font-medium">{m.programs_schedule_add_empty()}</span>
                <span className="text-muted-foreground text-xs">{m.programs_schedule_add_empty_hint()}</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <EmptyScheduleDialog open={empty} onClose={() => setEmpty(false)} action={action} kinds={options.emptyKinds} />
    </>
  )
}

function EmptyScheduleDialog({
  open,
  onClose,
  action,
  kinds,
}: {
  open: boolean
  onClose: () => void
  action: string
  kinds: ScheduleKind[]
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>()
  const preferred = () => (kinds.includes(ScheduleKind.Duty) ? ScheduleKind.Duty : (kinds[0] ?? ScheduleKind.Duty))
  const [kind, setKind] = useState<ScheduleKind>(preferred)
  const [wasOpen, setWasOpen] = useState(open)
  const [sent, setSent] = useState(false)
  // Each opening starts from the kinds the meeting still lacks: one added since leaves the other.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setKind(preferred())
    setSent(false)
  }
  const posted = kinds.includes(kind) ? kind : preferred()
  // Only the answer to a submission made since this opening: the fetcher outlives a cancelled dialog.
  const error = sent && fetcher.state === 'idle' && fetcher.data?.ok === false ? fetcher.data.error : undefined
  useCloseOnSave(fetcher, onClose)
  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent>
        <fetcher.Form method="post" action={action} onSubmit={() => setSent(true)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{m.programs_schedule_add_empty_title()}</DialogTitle>
            <DialogDescription>{m.programs_schedule_add_empty_body()}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="empty-schedule-name">{m.programs_schedule_name()}</Label>
            <Input id="empty-schedule-name" name="name" required maxLength={SCHEDULE_NAME_MAX} />
          </div>
          {kinds.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <span className="font-medium text-sm">{m.programs_schedule_add_kind()}</span>
              <SegmentedControl
                aria-label={m.programs_schedule_add_kind()}
                value={posted}
                onValueChange={setKind}
                options={kinds.map(value => ({ value, label: kindLabel(value) }))}
              />
            </div>
          )}
          <input type="hidden" name="kind" value={posted} />
          {error && (
            <Callout tone="danger" role="alert">
              {error}
            </Callout>
          )}
          <Callout tone="info">{m.programs_schedule_add_no_one()}</Callout>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {m.common_cancel()}
            </Button>
            <SubmitButton disabled={fetcher.state !== 'idle'}>{m.programs_schedule_add_submit()}</SubmitButton>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  )
}
