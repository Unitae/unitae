import { useMemo, useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'

export interface ScopeTerritory {
  id: number
  number: string
  type: string
}

/**
 * Two-panel transfer list for the campaign scope — congregations can hold
 * hundreds of territories, so a flat checklist doesn't scale. Clicking a row
 * moves it across; the bulk buttons act on the current search results. The
 * selection is submitted through hidden `scope` inputs.
 */
export function CampaignScopeEditor({
  territories,
  defaultSelectedIds,
}: {
  territories: ScopeTerritory[]
  defaultSelectedIds: number[]
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(defaultSelectedIds))
  const [search, setSearch] = useState('')

  const needle = search.trim().toLowerCase()
  const available = useMemo(
    () => territories.filter(t => !selected.has(t.id) && (needle === '' || t.number.toLowerCase().includes(needle))),
    [territories, selected, needle],
  )
  const selectedTerritories = useMemo(() => territories.filter(t => selected.has(t.id)), [territories, selected])

  const move = (id: number, into: boolean) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (into) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const addAll = () => setSelected(prev => new Set([...prev, ...available.map(t => t.id)]))
  const removeAll = () => setSelected(new Set())

  return (
    <div className="flex flex-col gap-2">
      {[...selected].map(id => (
        <input key={id} type="hidden" name="scope" value={id} />
      ))}
      <Input
        type="search"
        placeholder={m.campaigns_form_scope_search()}
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="font-medium text-muted-foreground text-xs">
            {m.campaigns_scope_available({ count: available.length })}
          </p>
          <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-md border p-1">
            {available.map(territory => (
              <button
                key={territory.id}
                type="button"
                onClick={() => move(territory.id, true)}
                className="rounded px-2 py-1 text-left text-sm hover:bg-muted"
              >
                {territory.number}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addAll} disabled={available.length === 0}>
            {m.campaigns_scope_add_all({ count: available.length })}
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="font-medium text-muted-foreground text-xs">
            {m.campaigns_scope_selected_panel({ count: selectedTerritories.length })}
          </p>
          <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-md border p-1">
            {selectedTerritories.map(territory => (
              <button
                key={territory.id}
                type="button"
                onClick={() => move(territory.id, false)}
                className="rounded px-2 py-1 text-left text-sm hover:bg-muted"
              >
                {territory.number}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={removeAll}
            disabled={selectedTerritories.length === 0}
          >
            {m.campaigns_scope_remove_all({ count: selectedTerritories.length })}
          </Button>
        </div>
      </div>
    </div>
  )
}
