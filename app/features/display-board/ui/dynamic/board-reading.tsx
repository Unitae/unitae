import { createContext, type ReactNode, useContext } from 'react'
import { Link } from 'react-router'
import { type BoardReader, isReader, personMatches } from '~/features/display-board/model/board-reader'
import type { BoardPerson } from '~/features/display-board/model/board-roster'
import { cn } from '~/shared/utils/utils'

// The reading layer of a board document on screen: the name being searched, the reader's own
// lines, the pages their rights open. The viewer provides it; anywhere else (the edit page's
// preview) the document renders bare, as its sheet prints. None of it ever reaches paper.

interface BoardReading {
  reader: BoardReader | null
  /** The search, as `boardSearchQuery` folds it; null when there is none. */
  query: string | null
}

const BoardReadingContext = createContext<BoardReading>({ reader: null, query: null })

export function BoardReadingProvider({ value, children }: { value: BoardReading; children: ReactNode }) {
  return <BoardReadingContext.Provider value={value}>{children}</BoardReadingContext.Provider>
}

export function useBoardReading(): BoardReading {
  return useContext(BoardReadingContext)
}

/** How one person shows under the reading: the reader's own name, a search hit, or dimmed by a search. */
export function usePersonReading(person: Omit<BoardPerson, 'id'> | null, memberId: number | null | undefined) {
  const { reader, query } = useBoardReading()
  const hit = personMatches(person, query)
  return { me: reader != null && isReader(memberId, reader), hit, dimmed: query != null && !hit }
}

/**
 * A link inside the document, for a reader whose rights open the page: it keeps the sheet's ink
 * and only underlines on hover or focus, so the document still reads as its sheet.
 */
export function DocLink({
  to,
  title,
  className,
  children,
}: {
  to: string
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      title={title}
      className={cn(
        'decoration-1 underline-offset-4 outline-none hover:underline focus-visible:underline print:no-underline',
        className,
      )}
    >
      {children}
    </Link>
  )
}
