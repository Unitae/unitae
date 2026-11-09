import { SegmentedControl } from '@unitae/ui'
import { Search } from 'lucide-react'
import { useState } from 'react'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { cn } from '~/shared/utils/utils'

const BY_NUMBER = new Intl.Collator(undefined, { numeric: true })

export interface ScopeTerritory {
  id: number
  number: string
}

/**
 * Every territory, or some of them picked as number tiles: a search narrows the tiles, « Tout sélectionner » takes the
 * ones shown. The choice goes out as hidden `scope` inputs; none means every territory.
 */
export function CampaignScopePicker({
  territories,
  defaultSelectedIds,
}: {
  territories: ScopeTerritory[]
  defaultSelectedIds: number[]
}) {
  const [mode, setMode] = useState<'all' | 'some'>(defaultSelectedIds.length > 0 ? 'some' : 'all')
  const [selected, setSelected] = useState<Set<number>>(new Set(defaultSelectedIds))
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const ordered = [...territories].sort((a, b) => BY_NUMBER.compare(a.number, b.number))
  const shown = ordered.filter(territory => needle === '' || territory.number.toLowerCase().includes(needle))
  const toggle = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <div className="col-span-full flex flex-col gap-3">
      {mode === 'some' && [...selected].map(id => <input key={id} type="hidden" name="scope" value={id} />)}
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          aria-label={m.campaigns_form_scope_legend()}
          options={[
            { value: 'all', label: m.campaigns_form_scope_all() },
            { value: 'some', label: m.campaigns_form_scope_some() },
          ]}
          value={mode}
          onValueChange={value => setMode(value as 'all' | 'some')}
        />
        {mode === 'some' && (
          <span className="text-faint text-sm tabular-nums">
            {m.campaigns_form_scope_count({ count: selected.size, total: territories.length })}
          </span>
        )}
      </div>
      {mode === 'some' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-56">
              <Search aria-hidden="true" className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
              <Input
                type="search"
                aria-label={m.campaigns_form_scope_search_label()}
                placeholder={m.campaigns_form_scope_search()}
                value={query}
                onChange={event => setQuery(event.target.value)}
                className="pl-8"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelected(prev => new Set([...prev, ...shown.map(territory => territory.id)]))}
            >
              {m.campaigns_form_scope_select_shown()}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              {m.campaigns_form_scope_clear()}
            </Button>
          </div>
          <ul
            aria-label={m.campaigns_form_scope_group()}
            className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5"
          >
            {shown.map(territory => {
              const on = selected.has(territory.id)
              return (
                <li key={territory.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(territory.id)}
                    className={cn(
                      'h-9 w-full rounded-sm border text-sm tabular-nums outline-none transition-colors duration-(--u-duration-fast) focus-visible:ring-2 focus-visible:ring-ring',
                      on
                        ? 'border-brand bg-brand-soft font-medium text-brand-text'
                        : 'border-border bg-surface text-muted-foreground hover:bg-hover',
                    )}
                  >
                    {territory.number}
                  </button>
                </li>
              )
            })}
          </ul>
          {selected.size === 0 && <p className="text-faint text-sm">{m.campaigns_form_scope_none_hint()}</p>}
        </>
      )}
    </div>
  )
}
