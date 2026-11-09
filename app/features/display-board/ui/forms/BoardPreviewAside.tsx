import { Link } from 'react-router'
import type { BoardCard as BoardCardData } from '~/features/display-board/server/board-home.queries'
import { BoardCard } from '~/features/display-board/ui/BoardCard'
import * as m from '~/i18n/paraglide/messages'

export interface PreviewFacts {
  reads: { read: number; audience: number }
  /** Who read it, on the management list; only for a reviewer. */
  readsTo: string | null
  versions: number
  historyTo: string | null
  createdAt: Date
}

interface BoardPreviewAsideProps {
  card: BoardCardData
  timeZone: string
  facts?: PreviewFacts
}

const rowClass = 'flex items-center justify-between gap-2 border-border border-t py-2.5 text-sm'

/**
 * The document as it shows on the board, to someone who has not opened it yet, following the title and
 * the end day as they are typed; then who has read it, its versions and when it arrived.
 */
export function BoardPreviewAside({ card, timeZone, facts }: BoardPreviewAsideProps) {
  return (
    <aside aria-label={m.board_form_on_board()} className="flex flex-col gap-3 max-lg:hidden">
      <span className="font-medium text-faint text-xs">{m.board_form_on_board()}</span>
      {/* A picture of the card: it leads nowhere from here, « Voir sur le tableau » does. */}
      <div inert>
        <BoardCard card={card} timeZone={timeZone} />
      </div>
      {facts && (
        <div className="flex flex-col">
          <div className={rowClass}>
            <span>{m.board_form_stat_reads()}</span>
            {facts.readsTo ? (
              <Link to={facts.readsTo} className="tabular-nums hover:underline">
                {m.board_reads_count(facts.reads)}
              </Link>
            ) : (
              <span className="text-muted-foreground tabular-nums">{m.board_reads_count(facts.reads)}</span>
            )}
          </div>
          <div className={rowClass}>
            <span>{m.board_form_stat_versions()}</span>
            {facts.historyTo ? (
              <Link to={facts.historyTo} preventScrollReset className="tabular-nums hover:underline">
                {facts.versions}
              </Link>
            ) : (
              <span className="text-muted-foreground tabular-nums">{facts.versions}</span>
            )}
          </div>
          <div className={rowClass}>
            <span>{m.board_form_stat_added()}</span>
            <span className="text-muted-foreground">
              {new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone }).format(facts.createdAt)}
            </span>
          </div>
        </div>
      )}
    </aside>
  )
}
