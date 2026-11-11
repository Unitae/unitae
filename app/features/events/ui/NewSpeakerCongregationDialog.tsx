import { useEffect, useRef } from 'react'
import { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { refusalMessage, SpeakerCongregationFields } from './SpeakerCongregationForm'

type Created = { ok: true; speakerCongregationId: number; next?: 'update' }

/**
 * « Nouvelle assemblée »: a short decision, so a dialog. « Créer et importer sa liste » goes straight on to the import
 * screen; « Créer » opens the new congregation in the panel.
 */
export function NewSpeakerCongregationDialog({
  allowImport = true,
  onOpenChange,
  onCreated,
}: {
  /** Off when opened from the speaker form: going to the import screen would drop the speaker being entered. */
  allowImport?: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (speakerCongregationId: number, next: 'update' | undefined) => void
}) {
  const fetcher = useFetcher()
  const error = refusalMessage(fetcher.data)
  const created = useRef(onCreated)
  created.current = onCreated

  useEffect(() => {
    const result = fetcher.data as Created | undefined
    if (fetcher.state === 'idle' && result?.ok) created.current(result.speakerCongregationId, result.next)
  }, [fetcher.state, fetcher.data])

  const busy = fetcher.state !== 'idle'
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <fetcher.Form method="post" className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="intent" value="congregation-create" />
          <DialogHeader>
            <DialogTitle>{m.external_speakers_new_congregation()}</DialogTitle>
            <DialogDescription>{m.external_speakers_congregation_new_description()}</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="bg-danger-soft text-danger-text rounded-md px-3 py-2.5 text-sm">
              {error}
            </p>
          )}
          <SpeakerCongregationFields congregation={null} withNotes={false} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {m.common_cancel()}
            </Button>
            <Button type="submit" variant={allowImport ? 'outline' : 'default'} disabled={busy}>
              {m.external_speakers_congregation_create()}
            </Button>
            {allowImport && (
              <Button type="submit" name="next" value="update" disabled={busy} className="max-md:hidden">
                {m.external_speakers_congregation_create_and_import()}
              </Button>
            )}
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  )
}
