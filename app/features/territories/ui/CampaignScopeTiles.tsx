import { Panel } from '@unitae/ui'
import { Link } from 'react-router'

import type { TileState } from '~/features/territories/model/campaign-progress'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

const TILE: Record<TileState, string> = {
  back: 'border-brand bg-brand font-medium text-white',
  out: 'border-brand bg-brand-soft font-medium text-brand-text',
  todo: 'border-border bg-surface text-muted-foreground',
}

const ARIA: Record<TileState, (input: { number: string }) => string> = {
  back: m.campaigns_tile_aria_back,
  out: m.campaigns_tile_aria_out,
  todo: m.campaigns_tile_aria_todo,
}

/** The campaign's scope as number tiles: returned, out, or not attributed yet — what is left to cover, at a glance. */
export function CampaignScopeTiles({ tiles }: { tiles: { id: number; number: string; state: TileState }[] }) {
  return (
    <Panel
      title={m.campaigns_scope_tiles_title()}
      actions={
        <span className="flex flex-wrap gap-3.5 text-faint text-xs">
          <Legend tile={TILE.back} label={m.campaigns_tile_back()} />
          <Legend tile={TILE.out} label={m.campaigns_tile_out()} />
          <Legend tile={TILE.todo} label={m.campaigns_tile_todo()} />
        </span>
      }
    >
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5 p-4">
        {tiles.map(tile => (
          <li key={tile.id}>
            <Link
              to={`/territories/territory/${tile.id}/view`}
              aria-label={ARIA[tile.state]({ number: tile.number })}
              className={cn(
                'flex h-9 items-center justify-center rounded-sm border text-sm tabular-nums outline-none transition-opacity duration-(--u-duration-fast) hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring',
                TILE[tile.state],
              )}
            >
              {tile.number}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function Legend({ tile, label }: { tile: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn('size-3 rounded-[3px] border', tile)} />
      {label}
    </span>
  )
}
