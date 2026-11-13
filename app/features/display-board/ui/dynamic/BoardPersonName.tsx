import { speakerName, textMatches } from '~/features/display-board/model/board-reader'
import { type BoardPerson, formatBoardPersonName } from '~/features/display-board/model/board-roster'
import * as m from '~/i18n/paraglide/messages'
import { type ExternalSpeakerLabelSource, externalSpeakerLabel } from '~/shared/utils/external-speaker-label'
import { cn } from '~/shared/utils/utils'
import { useBoardReading, usePersonReading } from './board-reading'

/** A name the search lights up; on paper it is a name like the others. */
const HIT =
  'rounded-[2px] bg-warning-soft shadow-[0_0_0_2px_var(--color-warning-soft)] print:bg-transparent print:shadow-none'
/** A name the search passes over. */
const DIMMED = 'opacity-30 print:opacity-100'

/**
 * « Prénom NOM » as the board lists show it: muted first name, bold uppercase last name. On screen
 * the reading layer adds the reader's mark (a dot and their first name in weight) and the search's
 * highlight or dimming; print drops all three.
 */
export function BoardPersonName({
  person,
  memberId,
}: {
  person: Omit<BoardPerson, 'id'> & { id?: number }
  /** The member to recognise the reader by, when the person carries no `id` of its own. */
  memberId?: number
}) {
  const name = formatBoardPersonName(person)
  const { me, hit, dimmed } = usePersonReading(person, memberId ?? person.id)
  if (name.kind === 'anonymized')
    return <span className={cn('text-muted-foreground italic', dimmed && DIMMED)}>{name.plain}</span>
  if (name.kind === 'empty') return <span className={cn(dimmed && DIMMED)}>{name.plain}</span>
  return (
    <span className={cn(hit && HIT, dimmed && DIMMED)}>
      {me && (
        <span
          aria-hidden="true"
          className="mr-1.5 inline-block size-1.5 rounded-full bg-primary align-[2px] print:hidden"
        />
      )}
      {name.firstname && (
        <span
          className={
            me ? 'font-semibold text-foreground print:font-normal print:text-muted-foreground' : 'text-muted-foreground'
          }
        >
          {name.firstname}{' '}
        </span>
      )}
      {name.lastname && <span className="font-bold">{name.lastname}</span>}
      {me && <span className="sr-only"> ({m.board_viewer_you()})</span>}
    </span>
  )
}

/** A visiting speaker as the programme names them, lit or passed over by the search like a member. */
export function BoardSpeakerName({ speaker }: { speaker: ExternalSpeakerLabelSource }) {
  const { query } = useBoardReading()
  const name = speakerName(speaker)
  const hit = name != null && textMatches(name, query)
  return <span className={cn(hit && HIT, query != null && !hit && DIMMED)}>{externalSpeakerLabel(speaker)}</span>
}
