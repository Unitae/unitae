import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router'

import type { EditorEntrance } from '~/features/territories/model/editor-entrance.type'
import type { Draft } from '~/features/territories/model/territory-draft'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { EditorPin } from './EditorPin'
import { addressOf } from './editor-labels'

/** A territory made during this visit: « Créés ici » lists them, the newest first. */
export interface CreatedTerritory {
  id: number
  number: string
  /** « 4 entrées · 42 foyers », said when it was created. */
  summary: string
}

/** The free entrances no map can show: added from the column, by hand. */
export function WithoutPositionList({
  entrances,
  total,
  draft,
  onAdd,
}: {
  entrances: EditorEntrance[]
  total: number
  draft: Draft
  onAdd: (entrance: EditorEntrance) => void
}) {
  const more = total - entrances.length
  return (
    <section aria-labelledby="without-position" className="border-border border-b px-5 py-3.5">
      <h2 id="without-position" className="font-medium text-sm">
        {m.split_tool_without_position_heading()}
      </h2>
      <p className="text-faint text-xs">{m.split_tool_without_position_hint()}</p>
      <ul className="mt-2 flex flex-col">
        {entrances.map(entrance => {
          const added = draft.has(entrance.id)
          return (
            <li key={entrance.id} className="flex h-10 items-center gap-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate tabular-nums">{addressOf(entrance)}</span>
              {added ? (
                <span className="text-faint text-xs">{m.split_tool_added()}</span>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={() => onAdd(entrance)}>
                  {m.split_tool_add()}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {more > 0 && (
        <p className="text-faint text-xs tabular-nums">
          {m.split_tool_more({ count: new Intl.NumberFormat(getLocale()).format(more) })}
        </p>
      )}
    </section>
  )
}

/** The territories made since the page opened, each opening in a new tab so the work in progress stays. */
export function CreatedList({ created }: { created: CreatedTerritory[] }) {
  if (created.length === 0) return null
  return (
    <section aria-labelledby="created-here" className="border-border border-t px-5 pt-4 pb-2">
      <h2 id="created-here" className="flex items-baseline gap-2 font-semibold">
        {m.split_tool_created_heading()}
        <span className="font-normal text-faint text-sm tabular-nums">{created.length}</span>
      </h2>
      <ul className="mt-1 flex flex-col">
        {created.map(territory => (
          <li key={territory.id} className="flex h-10 items-center gap-2.5 text-sm">
            <span className="min-w-11 font-semibold tabular-nums">{territory.number}</span>
            <span className="min-w-0 flex-1 truncate text-faint tabular-nums">{territory.summary}</span>
            <Button asChild variant="ghost" size="sm">
              <Link
                to={`/territories/territory/${territory.id}/view`}
                target="_blank"
                rel="noopener"
                title={m.split_tool_open_title({ number: territory.number })}
              >
                {m.split_tool_open()}
                <ExternalLink aria-hidden="true" />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** When the filters leave no free entrance of the type. */
export function NothingFree() {
  return (
    <div className="mx-5 mt-4 flex flex-col items-start gap-1.5 rounded-lg border border-border px-4 py-3.5">
      <p className="font-medium text-sm">{m.split_tool_nothing_free()}</p>
      <p className="text-muted-foreground text-sm">{m.split_tool_nothing_free_hint()}</p>
      <Button asChild variant="outline" size="sm" className="mt-1">
        <Link to="/territories/buildings">{m.split_tool_open_prospection()}</Link>
      </Button>
    </div>
  )
}

/** The bulk map's legend: the next territory's entrances, the free ones, the territories of the type. */
export function BatchLegend({ number }: { number: string }) {
  return (
    <ul
      aria-label={m.territory_editor_legend()}
      className="flex max-w-md flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-md bg-surface px-3 py-2 text-muted-foreground text-xs shadow-md ring-1 ring-border"
    >
      <li className="flex items-center gap-1.5">
        <EditorPin state="add" size="small" />
        {number}
      </li>
      <li className="flex items-center gap-1.5">
        <EditorPin state="free" size="small" />
        {m.territory_editor_legend_free()}
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true" className="text-faint">
          <path d="M2 3 L13 1.5 L14.5 10 L3 10.5 Z" fill="currentColor" fillOpacity="0.08" stroke="currentColor" />
        </svg>
        {m.split_tool_legend_territory()}
      </li>
    </ul>
  )
}
