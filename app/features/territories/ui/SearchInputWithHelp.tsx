import { Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '~/shared/ui/popover'

interface SearchInputWithHelpProps {
  defaultValue?: string
}

const ROTATION_INTERVAL_MS = 4000

/**
 * Search input with a rotating placeholder (cycling through name / address /
 * proximity examples) and an inline ⓘ popover explaining the `@` proximity
 * operator and auto-detection.
 *
 * Rotation pauses once the user focuses the input — we don't want the hint to
 * change underneath them as they type.
 */
export default function SearchInputWithHelp({ defaultValue }: SearchInputWithHelpProps) {
  const examples = [
    m.territories_filter_search_example_name(),
    m.territories_filter_search_example_address(),
    m.territories_filter_search_example_proximity(),
  ]
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  // Once the user has typed anything the placeholder examples have served
  // their purpose — never resume rotation, even after they clear the field.
  const [userTyped, setUserTyped] = useState(false)

  useEffect(() => {
    if (paused || userTyped) return
    const id = setInterval(() => setIndex(i => (i + 1) % examples.length), ROTATION_INTERVAL_MS)
    return () => clearInterval(id)
  }, [paused, userTyped, examples.length])

  return (
    <div className="relative max-sm:flex-1">
      <Input
        type="text"
        name="search"
        className="w-auto pr-9 max-sm:flex-1"
        placeholder={examples[index]}
        defaultValue={defaultValue}
        onFocus={() => setPaused(true)}
        onInput={() => setUserTyped(true)}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={m.territories_filter_help_aria()}
            className="absolute inset-y-0 right-0 my-auto h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <Info className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="text-sm">
          <p className="mb-2 font-medium">{m.territories_filter_help_title()}</p>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            <li>{m.territories_filter_help_item_name()}</li>
            <li>{m.territories_filter_help_item_number()}</li>
            <li>{m.territories_filter_help_item_address()}</li>
            <li>{m.territories_filter_help_item_proximity()}</li>
          </ul>
          <p className="mt-2 text-muted-foreground text-xs">{m.territories_filter_help_disclaimer()}</p>
        </PopoverContent>
      </Popover>
    </div>
  )
}
