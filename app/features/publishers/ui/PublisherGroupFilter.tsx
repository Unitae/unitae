import { ChevronDown } from 'lucide-react'
import { useSearchParams } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~/shared/ui/popover'
import { cn } from '~/shared/utils/utils'

export interface PublisherGroupOption {
  id: number
  name: string
}

interface PublisherGroupFilterProps {
  groups: PublisherGroupOption[]
  selectedIds: number[]
  paramName?: string
}

export function PublisherGroupFilter({ groups, selectedIds, paramName = 'group' }: PublisherGroupFilterProps) {
  const [, setSearchParams] = useSearchParams()
  const selected = new Set(selectedIds)

  const setGroupIds = (next: number[]) => {
    setSearchParams(
      prev => {
        prev.delete(paramName)
        for (const id of next) prev.append(paramName, String(id))
        return prev
      },
      { replace: true },
    )
  }

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setGroupIds([...next])
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 font-normal">
          {m.activity_filters_group_label()}
          {selected.size > 0 ? (
            <Badge variant="secondary" className="h-5 px-1.5">
              {selected.size}
            </Badge>
          ) : (
            <span className="text-muted-foreground">{m.activity_filters_group_all()}</span>
          )}
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <fieldset
          aria-label={m.activity_filters_group_label()}
          className="flex max-h-64 flex-wrap items-start gap-2 overflow-y-auto p-1"
        >
          {groups.length === 0 && (
            <span className="text-muted-foreground text-xs italic">{m.activity_filters_group_empty()}</span>
          )}
          {groups.map(group => {
            const isSelected = selected.has(group.id)
            return (
              <label
                key={group.id}
                htmlFor={`${paramName}-filter-${group.id}`}
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
                  id={`${paramName}-filter-${group.id}`}
                  value={group.id}
                  checked={isSelected}
                  onChange={() => toggle(group.id)}
                  className="sr-only"
                />
                {group.name}
              </label>
            )
          })}
        </fieldset>
      </PopoverContent>
    </Popover>
  )
}
