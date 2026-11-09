import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useSearchParams } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'

export interface FilterOption {
  value: string
  label: string
}

interface FilterMenuProps {
  /** URL query parameter it sets; without it, nothing is filtered. */
  paramName: string
  label: string
  options: FilterOption[]
  /** The first item, which clears the filter: « Toutes les sections ». */
  allLabel: string
  /** What the button reads after its label while nothing is filtered (« État : tous »); without it, the label alone. */
  idleValue?: string
  icon?: LucideIcon
}

/** No option can take it: the radio value of « everything ». */
const ALL = '\u0000all'

/**
 * One filter of a list's toolbar, as a button that names it and what it is set to, opening the
 * choices. Single choice, kept in the URL; the button reads the same before and after hydration.
 */
export function FilterMenu({ paramName, label, options, allLabel, idleValue, icon: Icon }: FilterMenuProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const current = options.find(option => option.value === searchParams.get(paramName))
  const value = current?.label ?? idleValue

  const select = (next: string) =>
    setSearchParams(
      prev => {
        if (next === ALL) prev.delete(paramName)
        else prev.set(paramName, next)
        prev.delete('page')
        return prev
      },
      { replace: true, preventScrollReset: true },
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="max-w-full">
          {Icon && <Icon className="text-muted-foreground" aria-hidden="true" />}
          <span className="truncate">{value ? m.filters_label_value({ label, value }) : label}</span>
          <ChevronDown className="text-faint" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuRadioGroup value={current?.value ?? ALL} onValueChange={select}>
          <DropdownMenuRadioItem value={ALL}>{allLabel}</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {options.map(option => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
