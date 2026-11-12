import { Status, type StatusTone } from '@unitae/ui'
import type { DisplayState } from '~/features/display-board/model/display-state'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'

const TONE: Record<DisplayState['kind'], StatusTone> = {
  shown: 'success',
  scheduled: 'warning',
  expired: 'danger',
  unpublished: 'neutral',
}

function formatDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', timeZone }).format(date)
}

export function stateText(state: DisplayState, timeZone: string): string {
  switch (state.kind) {
    case 'shown':
      return state.until ? m.board_state_shown_until({ date: formatDay(state.until, timeZone) }) : m.board_state_shown()
    case 'scheduled':
      return m.board_state_scheduled({ date: formatDay(state.from, timeZone) })
    case 'expired':
      return m.board_state_expired({ date: formatDay(state.until, timeZone) })
    default:
      return m.board_state_unpublished()
  }
}

/** Where a document stands: the colour on the mark, the words in ink. */
export function StateLabel({ state, timeZone }: { state: DisplayState; timeZone: string }) {
  return (
    <Status tone={TONE[state.kind]} className="whitespace-normal text-foreground">
      {stateText(state, timeZone)}
    </Status>
  )
}
