import { Building2, Undo2, X } from 'lucide-react'
import { Link } from 'react-router'

import type { EditorEntrance } from '~/features/territories/model/editor-entrance.type'
import type { Draft, DraftRow, StreetGroup } from '~/features/territories/model/territory-draft'
import { contentOf } from '~/features/territories/model/territory-draft'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { useForeignTerritoryContent } from '~/features/territories/ui/use-foreign-territory-content'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'

import { addressOf, contentText, rowCount, unitOf } from './editor-labels'

const TAG = 'inline-flex h-5 shrink-0 items-center rounded-sm px-1.5 font-medium text-xs'

interface EditorEntranceListProps {
  groups: StreetGroup[]
  /** Creating: every entrance is new, so none says « Ajoutée » and × simply takes it back. */
  creating: boolean
  kind: TerritoryKindKey
  count: number
  selectedId: number | null
  hotId: number | null
  empty: string
  onPick: (entrance: EditorEntrance) => void
  onHover: (id: number | null) => void
  onRemove: (entrance: EditorEntrance) => void
  onUndo: (id: number) => void
}

/**
 * The territory's entrances by street, one line each: hovering one lights its pin, picking it moves the map there;
 * × removes it, ↶ undoes its change. An entrance without a position says so and leads to its building.
 */
export function EditorEntranceList(props: EditorEntranceListProps) {
  const { groups, kind, count, empty } = props
  const unit = unitOf(kind)
  return (
    <section aria-labelledby="editor-entrances" className="flex flex-col pb-2">
      <div className="flex items-baseline gap-2 px-5 pt-4 pb-1.5">
        <h2 id="editor-entrances" className="font-semibold text-base">
          {m.territory_editor_entrances()}
        </h2>
        <span className="text-faint text-sm tabular-nums">{count}</span>
        <span className="flex-1" />
        {unit != null && count > 0 && <span className="text-faint text-xs">{unit}</span>}
      </div>
      {groups.length === 0 && <p className="mx-5 mt-1 text-muted-foreground text-sm leading-relaxed">{empty}</p>}
      {groups.map(group => (
        <div key={group.street}>
          <div aria-hidden="true" className="px-5 pt-2 pb-1 font-medium text-faint text-xs">
            {group.street}
          </div>
          <ul aria-label={group.street}>
            {group.rows.map(row => (
              <EntranceRow key={row.entrance.id} row={row} {...props} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function EntranceRow(props: EditorEntranceListProps & { row: DraftRow }) {
  const { row, kind, creating, selectedId, hotId, onPick, onHover, onRemove, onUndo } = props
  const { entrance } = row
  const change = creating && row.change?.kind === 'add' ? null : row.change
  const address = addressOf(entrance)
  const placed = entrance.latitude != null && entrance.longitude != null
  const tag = rowTag(change, placed)
  const count = rowCount(kind, entrance)
  const action = rowAction(row, change, address, { onRemove, onUndo })

  return (
    <li
      className={cn(
        'group/row flex h-10 items-center gap-2.5 pr-3 pl-5 transition-colors duration-(--u-duration-fast) hover:bg-hover max-md:h-12',
        entrance.id === hotId && 'bg-hover',
        entrance.id === selectedId && 'bg-selected',
      )}
      onMouseEnter={() => onHover(entrance.id)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        onClick={() => onPick(entrance)}
        disabled={!placed}
        className={cn(
          'min-w-0 flex-1 truncate text-left text-sm tabular-nums outline-none focus-visible:underline disabled:cursor-default',
          change?.kind === 'remove' && 'text-faint line-through',
        )}
      >
        <span className="font-semibold">{entrance.address.number}</span> {entrance.address.street}
      </button>
      {tag != null && (
        <span className={cn(TAG, tag.className)} title={tag.title}>
          {tag.text}
        </span>
      )}
      {count != null && <span className="text-faint text-sm tabular-nums">{count}</span>}
      {!placed && change == null && (
        <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground max-md:size-11">
          <Link
            to={`/territories/building/${entrance.buildingId}/view`}
            target="_blank"
            rel="noopener"
            aria-label={m.territory_editor_place_building({ address })}
          >
            <Building2 aria-hidden="true" />
          </Link>
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={action.label}
        title={action.label}
        onClick={action.run}
        className={cn(
          'text-muted-foreground max-md:size-11 md:opacity-0 md:focus-visible:opacity-100 md:group-hover/row:opacity-100',
          change != null && 'md:opacity-100',
        )}
      >
        <action.Icon aria-hidden="true" />
      </Button>
    </li>
  )
}

function rowTag(change: DraftRow['change'], placed: boolean) {
  if (change?.kind === 'add')
    return { text: m.territory_editor_tag_added(), className: 'bg-brand-soft text-brand-text' }
  if (change?.kind === 'remove') {
    return { text: m.territory_editor_tag_removed(), className: 'bg-danger-soft text-danger-text' }
  }
  if (change?.kind === 'take') {
    return {
      text: m.territory_editor_tag_taken({ territory: change.from.number }),
      className: 'bg-hover text-muted-foreground',
    }
  }
  if (!placed) {
    return {
      text: m.territory_editor_tag_no_position(),
      className: 'bg-hover text-faint',
      title: m.territory_editor_no_position_title(),
    }
  }
  return null
}

/** × removes a held entrance (or takes back a new one while creating); ↶ undoes a change. */
function rowAction(
  row: DraftRow,
  change: DraftRow['change'],
  address: string,
  { onRemove, onUndo }: Pick<EditorEntranceListProps, 'onRemove' | 'onUndo'>,
) {
  const { entrance } = row
  if (change == null) {
    return {
      label: m.territory_editor_remove({ address }),
      Icon: X,
      run: () => (row.change != null ? onUndo(entrance.id) : onRemove(entrance)),
    }
  }
  const label =
    change.kind === 'add'
      ? m.territory_editor_undo_add({ address })
      : change.kind === 'remove'
        ? m.territory_editor_undo_remove({ address })
        : m.territory_editor_undo_take({ address, territory: change.from.number })
  return { label, Icon: Undo2, run: () => onUndo(entrance.id) }
}

interface EditorChangesProps {
  draft: Draft
  kind: TerritoryKindKey
  onUndoAll: () => void
}

/** The changes before « Enregistrer »: what is added, removed, and what taking an entrance does to its territory. */
export function EditorChanges({ draft, kind, onUndoAll }: EditorChangesProps) {
  const changes = [...draft.values()]
  if (changes.length === 0) return null
  const added = changes.filter(change => change.kind === 'add').map(change => addressOf(change.entrance))
  const removed = changes.filter(change => change.kind === 'remove').map(change => addressOf(change.entrance))
  const taken = changes.flatMap(change => (change.kind === 'take' ? [change] : []))

  return (
    <section aria-labelledby="editor-changes" className="mt-2 border-border border-t">
      <div className="flex items-center gap-2 px-5 pt-3.5 pb-1">
        <h2 id="editor-changes" className="flex-1 font-semibold text-base">
          {m.territory_editor_changes()}
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={onUndoAll}>
          <Undo2 aria-hidden="true" />
          {m.territory_editor_undo_all()}
        </Button>
      </div>
      <ul className="flex flex-col gap-1.5 px-5 pt-1 pb-5 text-sm">
        {added.length > 0 && (
          <SummaryLine tag={`+${added.length}`} tagClass="bg-brand-soft text-brand-text" text={added.join(', ')} />
        )}
        {removed.length > 0 && (
          <SummaryLine
            tag={`−${removed.length}`}
            tagClass="bg-danger-soft text-danger-text"
            text={removed.join(', ')}
          />
        )}
        {taken.map(change => (
          <SummaryLine
            key={change.entrance.id}
            tag={change.from.number}
            tagClass="bg-hover text-muted-foreground"
            text={<TakeImpact address={addressOf(change.entrance)} change={change} kind={kind} />}
          />
        ))}
      </ul>
    </section>
  )
}

function SummaryLine({ tag, tagClass, text }: { tag: string; tagClass: string; text: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className={cn(TAG, tagClass, 'tabular-nums')}>{tag}</span>
      <span className="min-w-0 tabular-nums">{text}</span>
    </li>
  )
}

function TakeImpact({
  address,
  change,
  kind,
}: {
  address: string
  change: Extract<DraftRow['change'], { kind: 'take' }>
  kind: TerritoryKindKey
}) {
  const foreign = useForeignTerritoryContent(change.from.id)
  const moved = contentOf(kind, [change.entrance])
  if (foreign.status !== 'ready') return <>{`${address} · ${contentText(kind, moved)}`}</>
  const { quantity } = foreign.content
  return (
    <>
      {m.territory_editor_summary_take({
        address,
        territory: change.from.number,
        before: contentText(kind, quantity),
        after: contentText(kind, Math.max(0, quantity - moved)),
      })}
    </>
  )
}
