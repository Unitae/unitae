import type { FetcherWithComponents } from 'react-router'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import { computeDraftTotals } from '~/features/territories/ui/compute-draft-totals'
import { PendingEntranceList } from '~/features/territories/ui/PendingEntranceList'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'

type Props = {
  kind: TerritoryKind
  draft: ReadonlyMap<number, BboxEntrance>
  suggestedNumber: string
  onFocusEntrance: (entranceId: number) => void
  onRemove: (entranceId: number) => void
  onClear: () => void
  fetcher: FetcherWithComponents<unknown>
}

function totalsLabel(kind: TerritoryKind, draft: ReadonlyMap<number, BboxEntrance>): string {
  const totals = computeDraftTotals(kind, [...draft.values()])
  if (totals.count === 0) return m.split_tool_create_rail_empty()

  const isPlural = totals.count > 1
  if (totals.metric === 'homes') {
    return isPlural
      ? m.split_tool_create_totals_homes_other({ count: totals.count, primary: totals.primary })
      : m.split_tool_create_totals_homes_one({ count: totals.count, primary: totals.primary })
  }
  if (totals.metric === 'phones') {
    return isPlural
      ? m.split_tool_create_totals_phones_other({ count: totals.count, primary: totals.primary })
      : m.split_tool_create_totals_phones_one({ count: totals.count, primary: totals.primary })
  }
  return isPlural
    ? m.split_tool_create_totals_count_other({ count: totals.count })
    : m.split_tool_create_totals_count_one({ count: totals.count })
}

export function DraftTerritoryRail({
  kind,
  draft,
  suggestedNumber,
  onFocusEntrance,
  onRemove,
  onClear,
  fetcher,
}: Props) {
  const isEmpty = draft.size === 0
  const isSubmitting = fetcher.state !== 'idle'
  const canSubmit = !isEmpty && !isSubmitting

  return (
    <aside className="flex flex-col gap-4 lg:w-[380px] xl:w-[420px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base" data-testid="draft-rail-title">
            {m.split_tool_create_rail_title()}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">
              {m.split_tool_create_number_label()}
            </span>
            <span className="font-mono font-semibold text-lg tracking-wide" data-testid="draft-suggested-number">
              {suggestedNumber}
            </span>
          </div>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {totalsLabel(kind, draft)}
          </p>
        </CardContent>
      </Card>

      <PendingEntranceList
        savedTerritoryEntrances={[]}
        pendingAdditions={draft as Map<number, BboxEntrance>}
        pendingRemovals={new Map()}
        pendingReassignments={new Map()}
        territoryType={kind}
        showMap
        onFocusEntrance={onFocusEntrance}
        onRevert={onRemove}
        onRemoveById={onRemove}
      />

      <fetcher.Form
        method="post"
        action="/territories/buildings/split-territories/create"
        className="flex flex-col gap-2"
      >
        <input type="hidden" name="type" value={kind} />
        <input type="hidden" name="entranceIds" value={[...draft.keys()].join(',')} />
        <Button type="submit" disabled={!canSubmit}>
          {m.split_tool_create_button_with_number({ number: suggestedNumber })}
        </Button>
        <Button type="button" variant="ghost" onClick={onClear} disabled={isEmpty || isSubmitting}>
          {m.split_tool_create_clear_selection()}
        </Button>
      </fetcher.Form>
    </aside>
  )
}
