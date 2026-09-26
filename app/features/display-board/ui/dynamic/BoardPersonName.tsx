import { type BoardPerson, formatBoardPersonName } from '~/features/display-board/model/board-roster'

/** « Prénom NOM » as the board lists show it: muted first name, bold uppercase last name. */
export function BoardPersonName({ person }: { person: Omit<BoardPerson, 'id'> }) {
  const name = formatBoardPersonName(person)
  if (name.kind === 'anonymized') return <span className="text-muted-foreground italic">{name.plain}</span>
  if (name.kind === 'empty') return <span>{name.plain}</span>
  return (
    <span>
      {name.firstname && <span className="text-muted-foreground">{name.firstname} </span>}
      {name.lastname && <span className="font-semibold tracking-wide">{name.lastname}</span>}
    </span>
  )
}
