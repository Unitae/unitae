import * as m from '~/i18n/paraglide/messages'

import { EditorPin } from './EditorPin'

/** What the pins mean, in one line at the bottom of the map. */
export function EditorLegend({ mode, number }: { mode: 'new' | 'edit'; number: string }) {
  const items =
    mode === 'edit'
      ? ([
          ['in', number],
          ['free', m.territory_editor_legend_free()],
          ['other', m.territory_editor_legend_other()],
          ['add', m.territory_editor_legend_added()],
          ['remove', m.territory_editor_legend_removed()],
        ] as const)
      : ([
          ['add', m.territory_editor_legend_chosen()],
          ['free', m.territory_editor_legend_free()],
          ['other', m.territory_editor_legend_other()],
        ] as const)

  return (
    <ul
      aria-label={m.territory_editor_legend()}
      className="flex max-w-md flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-md bg-surface px-3 py-2 text-muted-foreground text-xs shadow-md ring-1 ring-border"
    >
      {items.map(([state, label]) => (
        <li key={state} className="flex items-center gap-1.5">
          <EditorPin state={state} size="small" />
          {label}
        </li>
      ))}
    </ul>
  )
}
