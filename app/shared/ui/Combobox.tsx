import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '~/shared/ui/popover'
import { cn } from '~/shared/utils/utils'
import { filterSuggestions } from './combobox-filter'

type ComboboxProps = {
  id?: string
  name: string
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  suggestions: string[]
  placeholder?: string
  disabled?: boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

export function Combobox({
  id,
  name,
  defaultValue,
  value,
  onValueChange,
  suggestions,
  placeholder,
  disabled = false,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: ComboboxProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listboxId = `${inputId}-listbox`

  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState(defaultValue ?? '')
  const currentValue = isControlled ? value : internalValue

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => filterSuggestions(currentValue, suggestions), [currentValue, suggestions])

  useEffect(() => {
    setActiveIndex(0)
  }, [])

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(0)
  }, [activeIndex, filtered.length])

  function commitValue(next: string) {
    if (!isControlled) setInternalValue(next)
    onValueChange?.(next)
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    commitValue(event.target.value)
    setOpen(true)
    setActiveIndex(0)
  }

  function pickSuggestion(suggestion: string) {
    commitValue(suggestion)
    setOpen(false)
    inputRef.current?.focus()
  }

  function moveActive(delta: 1 | -1) {
    if (filtered.length === 0) return
    setActiveIndex(i => (i + delta + filtered.length) % filtered.length)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const handlers: Record<string, () => void> = {
      ArrowDown: () => {
        event.preventDefault()
        if (!open) setOpen(true)
        moveActive(1)
      },
      ArrowUp: () => {
        event.preventDefault()
        moveActive(-1)
      },
      Enter: () => {
        if (!open || !filtered[activeIndex]) return
        event.preventDefault()
        pickSuggestion(filtered[activeIndex])
      },
      Escape: () => {
        if (!open) return
        event.preventDefault()
        setOpen(false)
      },
      Tab: () => setOpen(false),
    }
    handlers[event.key]?.()
  }

  const showPopover = open && filtered.length > 0

  return (
    <Popover open={showPopover} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          data-slot="input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPopover}
          aria-controls={listboxId}
          aria-activedescendant={showPopover ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={currentValue}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={cn(
            'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow,border-color] duration-150 selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
            'hover:border-ring/30',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'dark:bg-input/20',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          )}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-(--radix-popover-trigger-width) min-w-[12rem] p-1"
        onOpenAutoFocus={event => event.preventDefault()}
        onCloseAutoFocus={event => event.preventDefault()}
      >
        <div id={listboxId} role="listbox" className="max-h-72 overflow-y-auto">
          {filtered.map((suggestion, index) => {
            const isActive = index === activeIndex
            return (
              <button
                key={suggestion}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={isActive}
                data-active={isActive}
                onMouseDown={event => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pickSuggestion(suggestion)}
                className={cn(
                  'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
                  'data-[active=true]:bg-accent data-[active=true]:text-accent-foreground',
                )}
              >
                <span className="line-clamp-1">{suggestion}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
