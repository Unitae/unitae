import { ChevronDown } from 'lucide-react'
import { useSearchParams } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'

/** A list's order, kept in `?sort=`: « Trier : Sortie », one choice among a few. */
export function SortMenu<V extends string>({ value, options }: { value: V; options: { value: V; label: string }[] }) {
  const [, setSearchParams] = useSearchParams()
  const current = options.find(option => option.value === value) ?? options[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          <span className="text-faint">{m.attributions_sort_label()}</span>
          {current?.label}
          <ChevronDown className="text-faint" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuRadioGroup
          value={current?.value}
          onValueChange={next =>
            setSearchParams(
              prev => {
                prev.set('sort', next)
                return prev
              },
              { replace: true, preventScrollReset: true },
            )
          }
        >
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
