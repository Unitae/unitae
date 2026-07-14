import { useState } from 'react'
import { Input } from '~/shared/ui/input'
import { cn } from '~/shared/utils/utils'

export interface MemberOption {
  id: number
  firstname: string
  lastname: string | null
}

interface MemberMultiSelectProps {
  members: MemberOption[]
  selectedIds: number[]
  onChange: (next: number[]) => void
  searchPlaceholder: string
  emptyLabel: string
  labelledBy?: string
}

export function MemberMultiSelect({
  members,
  selectedIds,
  onChange,
  searchPlaceholder,
  emptyLabel,
  labelledBy,
}: MemberMultiSelectProps) {
  const [query, setQuery] = useState('')
  const selected = new Set(selectedIds)

  const normalisedQuery = query.trim().toLocaleLowerCase()
  const filtered =
    normalisedQuery === ''
      ? members
      : members.filter(member =>
          `${member.firstname} ${member.lastname ?? ''}`.toLocaleLowerCase().includes(normalisedQuery),
        )

  function toggle(id: number) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="search"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
      />
      <fieldset
        aria-labelledby={labelledBy}
        className="flex max-h-56 flex-wrap items-start gap-2 overflow-y-auto rounded-md border p-2"
      >
        <span className="sr-only" aria-live="polite">
          {selected.size}
        </span>
        {filtered.length === 0 && <span className="text-muted-foreground text-xs italic">{emptyLabel}</span>}
        {filtered.map(member => {
          const isSelected = selected.has(member.id)
          const displayName = `${member.firstname} ${member.lastname ?? ''}`.trim()
          return (
            <label
              key={member.id}
              htmlFor={`member-${member.id}`}
              className={cn(
                'inline-flex w-fit cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 font-medium text-xs transition-colors',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50',
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <input
                type="checkbox"
                id={`member-${member.id}`}
                value={member.id}
                checked={isSelected}
                onChange={() => toggle(member.id)}
                className="sr-only"
              />
              {displayName}
            </label>
          )
        })}
      </fieldset>
    </div>
  )
}
