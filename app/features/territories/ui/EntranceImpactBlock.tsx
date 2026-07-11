import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import type { TerritoryContent } from '~/features/territories/server/territory-content.queries'
import {
  type ForeignContentErrorReason,
  useForeignTerritoryContent,
} from '~/features/territories/ui/use-foreign-territory-content'
import * as m from '~/i18n/paraglide/messages'

function errorLine(reason: ForeignContentErrorReason): string {
  if (reason === 'not-found') return m.territories_map_popup_impact_not_found()
  return m.territories_map_popup_impact_error()
}

type ImpactSummary = { current: string; afterRemoval: string }

function summariseImpact(content: TerritoryContent, entrance: BboxEntrance): ImpactSummary {
  if (content.kind === TerritoryKind.Phone) {
    const after = Math.max(0, content.phones - entrance.phones)
    return {
      current: m.territories_map_popup_impact_phones({ count: content.phones }),
      afterRemoval: m.territories_map_popup_impact_after_removal_phones({ count: after }),
    }
  }
  if (content.kind === TerritoryKind.Classical || content.kind === TerritoryKind.Univ) {
    // Mirror computeTerritoryQuantity — Classical/Univ aggregate as `homes || phones` per entrance.
    const contribution = entrance.homes || entrance.phones
    const after = Math.max(0, content.quantity - contribution)
    return {
      current: m.territories_map_popup_impact_homes({ count: content.quantity }),
      afterRemoval: m.territories_map_popup_impact_after_removal_homes({ count: after }),
    }
  }
  const after = Math.max(0, content.entranceCount - 1)
  return {
    current: m.territories_map_popup_impact_addresses({ count: content.entranceCount }),
    afterRemoval: m.territories_map_popup_impact_after_removal_addresses({ count: after }),
  }
}

function secondaryAggregates(content: TerritoryContent): string[] {
  const isPhonePrimary = content.kind === TerritoryKind.Phone
  const isHomesPrimary = content.kind === TerritoryKind.Classical || content.kind === TerritoryKind.Univ
  const isEntrancePrimary = !isPhonePrimary && !isHomesPrimary

  const parts: string[] = []
  if (!isHomesPrimary && content.homes > 0) parts.push(m.territories_map_popup_impact_homes({ count: content.homes }))
  if (!isPhonePrimary && content.phones > 0)
    parts.push(m.territories_map_popup_impact_phones({ count: content.phones }))
  if (content.liberals > 0) parts.push(m.territories_map_popup_impact_liberals({ count: content.liberals }))
  if (!isEntrancePrimary) parts.push(m.territories_map_popup_impact_addresses({ count: content.entranceCount }))
  return parts
}

function ImpactReadyView({ content, entrance }: { content: TerritoryContent; entrance: BboxEntrance }) {
  const summary = summariseImpact(content, entrance)
  const secondary = secondaryAggregates(content)
  return (
    <>
      <p className="mt-1 text-muted-foreground text-xs">{summary.current}</p>
      <p className="text-muted-foreground text-xs italic">{summary.afterRemoval}</p>
      {secondary.length > 0 ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{secondary.join(' · ')}</p>
      ) : null}
    </>
  )
}

export function EntranceImpactBlock({
  entrance,
  territoryNumber,
}: {
  entrance: BboxEntrance
  territoryNumber: string
}) {
  const state = useForeignTerritoryContent(entrance.otherTerritory?.id ?? null)
  return (
    <div className="mt-1 rounded-md border bg-muted/40 p-2">
      <p className="font-medium text-xs">{m.territories_map_popup_impact_title({ number: territoryNumber })}</p>
      {state.status === 'loading' || state.status === 'idle' ? (
        <p className="mt-1 text-muted-foreground text-xs italic">{m.territories_map_popup_impact_loading()}</p>
      ) : null}
      {state.status === 'error' ? <p className="mt-1 text-destructive text-xs">{errorLine(state.reason)}</p> : null}
      {state.status === 'ready' ? <ImpactReadyView content={state.content} entrance={entrance} /> : null}
    </div>
  )
}
