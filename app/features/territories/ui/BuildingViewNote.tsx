import * as m from '~/i18n/paraglide/messages'
import type { BuildingView } from '../model/building-list'

/** What a work list holds and why, under the toolbar. */
export function BuildingViewNote({ view, validity }: { view: BuildingView; validity: number }) {
  const note =
    view === 'check'
      ? validity > 0
        ? m.prospection_note_check({ months: validity })
        : m.prospection_note_check_no_validity()
      : view === 'new'
        ? m.prospection_note_new()
        : view === 'missing'
          ? m.prospection_note_missing()
          : null
  return note ? <p className="max-w-3xl text-muted-foreground text-sm">{note}</p> : null
}

export function emptyViewText(view: BuildingView): string {
  if (view === 'check') return m.prospection_view_empty_check()
  if (view === 'new') return m.prospection_view_empty_new()
  if (view === 'missing') return m.prospection_view_empty_missing()
  return m.prospection_view_empty_active()
}
