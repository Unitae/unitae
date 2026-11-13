import { type BoardPerson, formatBoardPersonName } from '~/features/display-board/model/board-roster'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'
import { usePersonReading } from './board-reading'

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
    return (
      <span className={cn('text-muted-foreground italic', dimmed && 'opacity-30 print:opacity-100')}>{name.plain}</span>
    )
  if (name.kind === 'empty') return <span>{name.plain}</span>
  return (
    <span
      className={cn(
        hit &&
          'rounded-[2px] bg-warning-soft shadow-[0_0_0_2px_var(--color-warning-soft)] print:bg-transparent print:shadow-none',
        dimmed && 'opacity-30 print:opacity-100',
      )}
    >
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
