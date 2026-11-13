import { Plus } from 'lucide-react'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'

/**
 * « Nouvelle assemblée » and « Nouvel orateur » in the speakers page's top bar; on a phone, one « + » menu holds both,
 * as the phone board draws it.
 */
export function SpeakerCreateActions({
  onNewSpeaker,
  onNewCongregation,
}: {
  onNewSpeaker: () => void
  onNewCongregation: () => void
}) {
  return (
    <>
      <span className="contents max-sm:hidden">
        <Button variant="outline" size="sm" onClick={onNewCongregation}>
          <Plus aria-hidden="true" />
          {m.external_speakers_new_congregation()}
        </Button>
        <Button size="sm" onClick={onNewSpeaker}>
          <Plus aria-hidden="true" />
          {m.external_speakers_new_speaker()}
        </Button>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" className="sm:hidden" aria-label={m.external_speakers_new_menu()}>
            <Plus aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onNewSpeaker}>{m.external_speakers_new_speaker()}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onNewCongregation}>{m.external_speakers_new_congregation()}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
