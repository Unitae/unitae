import { Link, useFetcher } from 'react-router'
import type { DirectorySpeaker, SpeakerVisits } from '~/features/events/model/external-speaker.type'
import { formatSpeakerDate } from '~/features/events/model/speaker-dates'
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
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { externalSpeakerLabel } from '~/shared/utils/external-speaker-label'

// The two confirmations a speaker's « … » menu asks for: retiring from the list, which is undone in one click, and
// deleting for good, which is not. Each says what it does to the programmes before it does it.

interface DialogProps {
  speaker: DirectorySpeaker
  congregationName: string | null
  visits: SpeakerVisits | null
  timezone: string
  onOpenChange: (open: boolean) => void
}

function useAction(onDone: () => void) {
  const fetcher = useFetcher()
  useCloseOnSave(fetcher, onDone)
  return fetcher
}

export function RetireSpeakerDialog({ speaker, visits, timezone, onOpenChange }: DialogProps) {
  const fetcher = useAction(() => onOpenChange(false))
  const next = visits?.upcoming[0] ?? null
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.external_speakers_retire_title({ name: speaker.name })}</AlertDialogTitle>
          <AlertDialogDescription>{m.external_speakers_retire_body()}</AlertDialogDescription>
        </AlertDialogHeader>
        {next && (
          <p className="bg-warning-soft rounded-md px-3 py-2.5 text-sm">
            {m.external_speakers_retire_planned({ date: formatSpeakerDate(next.date, timezone) })}{' '}
            <Link to={`/programs/events/${next.eventId}`} className="text-primary font-medium hover:underline">
              {m.external_speakers_open_programme()}
            </Link>
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="speaker-retire" />
            <input type="hidden" name="speakerId" value={speaker.id} />
            <Button type="submit" disabled={fetcher.state !== 'idle'}>
              {m.external_speakers_retire_confirm()}
            </Button>
          </fetcher.Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function DeleteSpeakerDialog({ speaker, congregationName, visits, timezone, onOpenChange }: DialogProps) {
  const fetcher = useAction(() => onOpenChange(false))
  const upcoming = visits?.upcoming ?? []
  const past = visits?.past.length ?? 0
  const label = externalSpeakerLabel({
    name: '',
    anonymizedAt: new Date(),
    speakerCongregation: congregationName ? { name: congregationName } : null,
  })
  const dates = upcoming.map(visit => formatSpeakerDate(visit.date, timezone)).join(', ')
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.external_speakers_delete_title({ name: speaker.name })}</AlertDialogTitle>
          <AlertDialogDescription>{m.external_speakers_delete_body()}</AlertDialogDescription>
        </AlertDialogHeader>
        {(upcoming.length > 0 || past > 0) && (
          <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-5 text-sm">
            {upcoming.length > 0 && (
              <li>
                {upcoming.length === 1
                  ? m.external_speakers_delete_freed_one({ dates })
                  : m.external_speakers_delete_freed_many({ count: String(upcoming.length), dates })}
              </li>
            )}
            {past > 0 && (
              <li>
                {past === 1
                  ? m.external_speakers_delete_past_one({ label })
                  : m.external_speakers_delete_past_many({ count: String(past), label })}
              </li>
            )}
          </ul>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="speaker-delete" />
            <input type="hidden" name="speakerId" value={speaker.id} />
            <Button type="submit" variant="destructive" disabled={fetcher.state !== 'idle'}>
              {m.external_speakers_delete_confirm()}
            </Button>
          </fetcher.Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
