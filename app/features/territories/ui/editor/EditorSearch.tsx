import { Plus, Search } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useFetcher } from 'react-router'

import type { EditorSearchResult } from '~/features/territories/model/editor-entrance.type'
import type { Draft } from '~/features/territories/model/territory-draft'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { useDebouncedValue } from '~/shared/ui/hooks/use-debounced-value'
import { Input } from '~/shared/ui/input'

import { rowCount } from './editor-labels'

interface EditorSearchProps {
  kind: TerritoryKindKey
  territoryId: number | null
  draft: Draft
  onAdd: (entrance: EditorSearchResult) => void
  onTake: (entrance: EditorSearchResult, from: { id: number; number: string }) => void
}

/** Where no map can show: one search by number, street or postcode, each result added (or taken) in one press. */
export function EditorSearch({ kind, territoryId, draft, onAdd, onTake }: EditorSearchProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim(), 250)
  const fetcher = useFetcher<{ results: EditorSearchResult[] }>()
  const { load } = fetcher

  useEffect(() => {
    if (debounced.length < 2) return
    const params = new URLSearchParams({ kind, q: debounced })
    if (territoryId != null) params.set('territory', String(territoryId))
    load(`/territories/api/editor-entrances?${params.toString()}`)
  }, [debounced, kind, territoryId, load])

  const results = debounced.length >= 2 ? (fetcher.data?.results ?? []) : []

  return (
    <div className="flex flex-col gap-2.5 border-border border-b px-5 py-4">
      <label htmlFor={id} className="font-medium text-sm">
        {m.territory_editor_search_label()}
      </label>
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
        <Input
          id={id}
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={m.territory_editor_search_placeholder()}
          className="pl-8"
          autoComplete="off"
          onKeyDown={event => {
            // Inside the territory's form: Enter adds the first result rather than saving the territory.
            if (event.key !== 'Enter') return
            event.preventDefault()
            const first = results.find(result => !draft.has(result.id))
            if (first == null) return
            if (first.otherTerritory != null) onTake(first, first.otherTerritory)
            else onAdd(first)
          }}
        />
      </div>
      {debounced.length >= 2 && fetcher.state === 'idle' && results.length === 0 && (
        <p className="text-muted-foreground text-sm">{m.territory_editor_search_none()}</p>
      )}
      {results.length > 0 && (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
          {results.map(result => {
            const chosen = draft.has(result.id)
            const other = result.otherTerritory
            const count = rowCount(kind, result)
            return (
              <li key={result.id} className="flex h-10 items-center gap-2.5 pr-1.5 pl-3 text-sm max-md:h-12">
                <span className="min-w-0 flex-1 truncate tabular-nums">
                  <span className="font-semibold">{result.address.number}</span> {result.address.street}
                </span>
                {other != null && (
                  <span className="inline-flex h-5 items-center rounded-sm bg-hover px-1.5 font-medium text-faint text-xs">
                    {m.territory_editor_search_on({ territory: other.number })}
                  </span>
                )}
                {count != null && <span className="text-faint tabular-nums">{count}</span>}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={chosen}
                  onClick={() => (other != null ? onTake(result, other) : onAdd(result))}
                  className="max-md:h-11"
                >
                  {!chosen && <Plus aria-hidden="true" />}
                  {chosen
                    ? m.territory_editor_search_chosen()
                    : other != null
                      ? m.territory_editor_search_take()
                      : m.territory_editor_search_add()}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-faint text-xs">{m.territory_editor_search_hint()}</p>
    </div>
  )
}
