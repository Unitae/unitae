import { MapDot } from '@unitae/ui'
import { Building2, Plus, Undo2, X } from 'lucide-react'
import { Link } from 'react-router'
import { type ShopKind, shopKindLabels } from '~/features/territories/model/shop-kind.type'
import type { DraftChange, PinState } from '~/features/territories/model/territory-draft'
import { contentOf } from '~/features/territories/model/territory-draft'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { holderName } from '~/features/territories/ui/attribution-labels'
import { useForeignTerritoryContent } from '~/features/territories/ui/use-foreign-territory-content'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { entranceAccessLabels } from '../entrance-access-labels'
import { addressOf, contentText } from './editor-labels'
import type { MapEntrance } from './editor-map-entrance'

interface EditorEntranceCardProps {
  entrance: MapEntrance
  change: DraftChange | null
  pin: PinState
  kind: TerritoryKindKey
  onAdd: () => void
  onRemove: () => void
  onTake: () => void
  onUndo: () => void
  onClose: () => void
}

/**
 * The entrance picked on the map, docked in its corner (across its width on a phone): where it stands, what taking it
 * does to the territory holding it, and the one action that fits.
 */
export function EditorEntranceCard(props: EditorEntranceCardProps) {
  const { entrance, change, pin, kind, onClose } = props
  const other =
    change?.kind === 'take' ? change.from : entrance.standing === 'on-other-territory' ? entrance.otherTerritory : null
  const foreign = useForeignTerritoryContent(other?.id ?? null)
  const content = foreign.status === 'ready' ? foreign.content : null
  const title = addressOf(entrance)
  const access = entranceAccessLabels(entrance)

  const facts = [
    kind === TerritoryKindKey.Commerces
      ? (shopKindLabels()[entrance.shopKind as ShopKind] ?? m.territory_doc_shop_fallback())
      : contentText(kind, contentOf(kind, [entrance])),
    entrance.prospectionDate != null &&
      m.territory_editor_prospected({
        date: new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(
          new Date(entrance.prospectionDate),
        ),
      }),
  ].filter(Boolean)

  return (
    <section
      aria-label={title}
      className="absolute bottom-7 z-10 flex animate-fade-in-up flex-col gap-2.5 rounded-lg bg-surface px-3.5 pt-3 pb-3.5 shadow-lg ring-1 ring-border max-xl:inset-x-2 xl:right-3 xl:w-80"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
          <span className="font-semibold tabular-nums">{title}</span>
          <span className="text-faint text-sm tabular-nums">{facts.join(' · ')}</span>
          {access.length > 0 && <span className="text-muted-foreground text-sm">{access.join(' · ')}</span>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground max-xl:size-11"
          aria-label={m.my_territories_card_close()}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <span className="flex items-center gap-2 text-sm">
        <MapDot state={pin} size="small" />
        {stateText(props, content?.holder ?? null)}
      </span>
      {other != null && content != null && (
        <div className="flex flex-col gap-0.5 rounded-md bg-sidebar px-2.5 py-2 text-sm tabular-nums">
          <span>
            {m.territory_editor_impact({
              territory: other.number,
              before: contentText(kind, content.quantity),
              after: contentText(kind, Math.max(0, content.quantity - contentOf(kind, [entrance]))),
            })}
          </span>
          <span className="text-faint text-xs">
            {change?.kind === 'take' ? m.territory_editor_impact_on_save() : m.territory_editor_impact_if()}
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <CardAction {...props} />
        {/* In a new tab: leaving the editor would lose its changes. */}
        <Button asChild variant="ghost" size="sm" className="max-xl:h-11">
          <Link to={`/territories/building/${entrance.buildingId}/view`} target="_blank" rel="noopener">
            <Building2 aria-hidden="true" />
            {m.territory_editor_building()}
          </Link>
        </Button>
        {other != null && (
          <Button asChild variant="ghost" size="sm" className="max-xl:h-11">
            <Link to={`/territories/territory/${other.id}/view`} target="_blank" rel="noopener">
              {m.territory_editor_view_territory({ territory: other.number })}
            </Link>
          </Button>
        )}
      </div>
    </section>
  )
}

function stateText(
  { entrance, change }: EditorEntranceCardProps,
  holder: { firstname: string | null; lastname: string | null; anonymized: boolean } | null,
): string {
  if (change?.kind === 'add') return m.territory_editor_state_added()
  if (change?.kind === 'remove') return m.territory_editor_state_removed()
  if (change?.kind === 'take') return m.territory_editor_state_taken({ territory: change.from.number })
  if (entrance.standing === 'in-this-territory') return m.territory_editor_state_in()
  if (entrance.standing === 'available' || entrance.otherTerritory == null) return m.territory_editor_state_free()
  const territory = entrance.otherTerritory.number
  return holder != null
    ? m.territory_editor_state_other_holder({ territory, name: holderName(holder) })
    : m.territory_editor_state_other({ territory })
}

function CardAction({ entrance, change, onAdd, onRemove, onTake, onUndo }: EditorEntranceCardProps) {
  const touch = 'max-xl:h-11 max-xl:flex-1'
  if (change != null) {
    const label =
      change.kind === 'add'
        ? m.territory_editor_undo_add_short()
        : change.kind === 'remove'
          ? m.territory_editor_undo_remove_short()
          : m.territory_editor_leave_with({ territory: change.from.number })
    return (
      <Button type="button" variant="outline" size="sm" className={touch} onClick={onUndo}>
        <Undo2 aria-hidden="true" />
        {label}
      </Button>
    )
  }
  if (entrance.standing === 'in-this-territory') {
    return (
      <Button type="button" variant="outline" size="sm" className={touch} onClick={onRemove}>
        <X aria-hidden="true" />
        {m.territory_editor_remove_short()}
      </Button>
    )
  }
  const other = entrance.standing === 'on-other-territory' ? entrance.otherTerritory : null
  return (
    <Button type="button" size="sm" className={touch} onClick={other != null ? onTake : onAdd}>
      <Plus aria-hidden="true" />
      {other != null ? m.territory_editor_take({ territory: other.number }) : m.territory_editor_add()}
    </Button>
  )
}
