import { Search } from 'lucide-react'
import { type KeyboardEvent, useId, useMemo, useState } from 'react'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'

type Props = {
  candidates: BboxEntrance[]
  onSelect: (entranceId: number) => void
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export default function MapSearchBox({ candidates, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const [open, setOpen] = useState(false)
  const listId = useId()

  const matches = useMemo(() => {
    const q = normalize(query.trim())
    if (q.length < 2) return [] as BboxEntrance[]
    const seen = new Set<number>()
    const results: BboxEntrance[] = []
    for (const e of candidates) {
      if (seen.has(e.id)) continue
      const haystack = normalize(`${e.address.number} ${e.address.street} ${e.address.zip}`)
      if (haystack.includes(q)) {
        results.push(e)
        seen.add(e.id)
        if (results.length >= 8) break
      }
    }
    return results
  }, [candidates, query])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted(prev => Math.min(prev + 1, matches.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted(prev => Math.max(prev - 1, 0))
      return
    }
    if (event.key === 'Enter' && matches[highlighted] != null) {
      event.preventDefault()
      onSelect(matches[highlighted].id)
      setQuery('')
      setOpen(false)
      return
    }
    if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="pointer-events-auto flex w-64 flex-col gap-1 max-sm:w-56">
      <div className="relative">
        <Search
          className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={event => {
            setQuery(event.target.value)
            setOpen(true)
            setHighlighted(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay to allow click on suggestion to register before blur dismisses the list
            setTimeout(() => setOpen(false), 150)
          }}
          onKeyDown={handleKeyDown}
          placeholder={m.territories_map_search_placeholder()}
          className="h-9 bg-card/95 pl-7 text-sm shadow-sm backdrop-blur"
          aria-controls={listId}
          aria-expanded={open && query.length >= 2}
          role="combobox"
        />
      </div>
      {open && query.trim().length >= 2 ? (
        <ul
          id={listId}
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: combobox listbox pattern
          role="listbox"
          className="flex max-h-64 flex-col overflow-auto rounded-md border bg-card/95 text-sm shadow-md backdrop-blur"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground italic">{m.territories_map_search_no_results()}</li>
          ) : (
            matches.map((entrance, index) => (
              <li key={entrance.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlighted}
                  onMouseDown={event => {
                    event.preventDefault()
                    onSelect(entrance.id)
                    setQuery('')
                    setOpen(false)
                  }}
                  onMouseEnter={() => setHighlighted(index)}
                  className={`block w-full px-3 py-2 text-left ${index === highlighted ? 'bg-accent' : ''}`}
                >
                  <span className="block font-medium">
                    {entrance.address.number} {entrance.address.street}
                  </span>
                  <span className="block text-muted-foreground text-xs">{entrance.address.zip}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
