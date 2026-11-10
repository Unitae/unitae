import { ChevronDown } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { NO_GROUP_PARAM } from '~/features/publishers/model/publisher-list-filters'
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
  /**
   * « Sans groupe » as one more choice, posted as `none`, and whether it is chosen. Only for lists whose query reads
   * it: the publishers list does, the activity pages do not.
   */
  noGroup?: { selected: boolean }
}

export function PublisherGroupFilter({ groups, selectedIds, paramName = 'group', noGroup }: PublisherGroupFilterProps) {
  const [, setSearchParams] = useSearchParams()
  const selected = new Set(selectedIds)
  const noneSelected = noGroup?.selected ?? false

  const setGroups = (next: number[], none: boolean) => {
    setSearchParams(
      prev => {
        prev.delete(paramName)
        for (const id of next) prev.append(paramName, String(id))
        if (none) prev.append(paramName, NO_GROUP_PARAM)
        return prev
      },
      { replace: true },
    )
  }

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setGroups([...next], noneSelected)
  }
  const count = selected.size + (noneSelected ? 1 : 0)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 font-normal">
          {m.activity_filters_group_label()}
          {count > 0 ? (
            <Badge variant="secondary" className="h-5 px-1.5">
              {count}
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
          {groups.length === 0 && noGroup == null && (
            <span className="text-muted-foreground text-xs italic">{m.activity_filters_group_empty()}</span>
          )}
          {groups.map(group => (
            <GroupChip
              key={group.id}
              id={`${paramName}-filter-${group.id}`}
              label={group.name}
              checked={selected.has(group.id)}
              onToggle={() => toggle(group.id)}
            />
          ))}
          {noGroup && (
            <GroupChip
              id={`${paramName}-filter-none`}
              label={m.publishers_move_no_group()}
              checked={noneSelected}
              onToggle={() => setGroups([...selected], !noneSelected)}
            />
          )}
        </fieldset>
      </PopoverContent>
    </Popover>
  )
}

function GroupChip({
  id,
  label,
  checked,
  onToggle,
}: {
  id: string
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex w-fit cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 font-medium text-xs transition-colors',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50',
        checked
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <input type="checkbox" id={id} checked={checked} onChange={onToggle} className="sr-only" />
      {label}
    </label>
  )
}
