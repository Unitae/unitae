import { Avatar, StatusIcon } from '@unitae/ui'
import { ChevronDownIcon, Search } from 'lucide-react'
import { Fragment, type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'

import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '~/shared/ui/popover'
import { comparePersonName, formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

const NONE_VALUE = ''

export type PersonOption = {
  id: number
  firstname: string | null
  lastname: string | null
  /** A name kept as written, for people known by one name only (an external speaker): shown and sorted as is. */
  name?: string
}

const labelOf = (person: PersonOption, fallback?: string) => person.name ?? formatPersonName(person, fallback)

function compareOptions(a: PersonOption, b: PersonOption): number {
  if (a.name == null && b.name == null) return comparePersonName(a, b)
  return labelOf(a, '').localeCompare(labelOf(b, ''), 'fr', { sensitivity: 'base' })
}

/** How one person reads in the list, when the caller knows something about them. */
export interface PersonDescription {
  /** One line of facts under the name. */
  facts?: string
  /** Something worth a look, or a reason not to pick the person. */
  tone?: 'warning' | 'danger'
  /** People with a label go to the end of the list, under it. */
  setAside?: string
  /** Orders the people, smaller first, before their name does. */
  rank?: number
}

type PersonDropdownProps = {
  name: string
  people: PersonOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  allowNone?: boolean
  noneLabel?: string
  disabled?: boolean
  disabledIds?: number[]
  disabledReason?: (id: number) => string | undefined
  /**
   * Facts about each person, to compare before choosing: a line under the name, an order and a group set aside at
   * the end. With it, people also show their initials. Without it the list is plain and sorted by name.
   */
  describePerson?: (id: number) => PersonDescription | undefined
  emptyState?: ReactNode
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function PersonDropdown({
  name,
  people,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  allowNone = true,
  noneLabel,
  disabled = false,
  disabledIds,
  disabledReason,
  describePerson,
  emptyState,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: PersonDropdownProps) {
  const generatedId = useId()
  const triggerId = id ?? generatedId
  const listboxId = `${triggerId}-listbox`

  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState(defaultValue ?? NONE_VALUE)
  const currentValue = isControlled ? value : internalValue

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const sortedPeople = useMemo(() => {
    if (!describePerson) return [...people].sort(compareOptions)
    const order = (person: PersonOption) => {
      const description = describePerson(person.id)
      return { aside: description?.setAside ? 1 : 0, rank: description?.rank ?? Number.POSITIVE_INFINITY }
    }
    return [...people].sort((a, b) => {
      const left = order(a)
      const right = order(b)
      return left.aside - right.aside || left.rank - right.rank || compareOptions(a, b)
    })
  }, [people, describePerson])

  const disabledSet = useMemo(() => new Set(disabledIds), [disabledIds])

  const filteredPeople = useMemo(() => {
    const q = normalize(query)
    if (!q) return sortedPeople
    return sortedPeople.filter(person => normalize(labelOf(person, '')).includes(q))
  }, [sortedPeople, query])

  const items = useMemo(() => {
    const list = filteredPeople.map(person => ({
      kind: 'person' as const,
      id: person.id,
      label: labelOf(person),
      disabled: disabledSet.has(person.id),
      reason: disabledSet.has(person.id) ? disabledReason?.(person.id) : undefined,
      description: describePerson?.(person.id),
    }))
    if (allowNone && !query) {
      return [
        {
          kind: 'none' as const,
          id: -1,
          label: noneLabel ?? m.common_none(),
          disabled: false,
          reason: undefined,
          description: undefined,
        },
        ...list,
      ]
    }
    return list
  }, [filteredPeople, allowNone, query, noneLabel, disabledSet, disabledReason, describePerson])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset highlight when query changes or popover opens
  useEffect(() => {
    setActiveIndex(0)
  }, [query, open])

  const triggerLabel = useMemo(() => {
    if (currentValue === NONE_VALUE) return placeholder ?? m.person_dropdown_placeholder()
    const selected = people.find(p => p.id.toString() === currentValue)
    if (!selected) return placeholder ?? m.person_dropdown_placeholder()
    return labelOf(selected)
  }, [currentValue, people, placeholder])

  const isPlaceholder = currentValue === NONE_VALUE || !people.find(p => p.id.toString() === currentValue)

  function commitValue(next: string) {
    if (!isControlled) setInternalValue(next)
    onValueChange?.(next)
    setOpen(false)
    setQuery('')
  }

  function selectIndex(index: number) {
    const item = items[index]
    if (!item || item.disabled) return
    if (item.kind === 'none') {
      commitValue(NONE_VALUE)
    } else {
      commitValue(item.id.toString())
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(i => findNextEnabled(items, i, 1))
      requestAnimationFrame(scrollActiveIntoView)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(i => findNextEnabled(items, i, -1))
      requestAnimationFrame(scrollActiveIntoView)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      selectIndex(activeIndex)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(findNextEnabled(items, -1, 1))
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(findNextEnabled(items, items.length, -1))
    }
  }

  function scrollActiveIntoView() {
    const el = listRef.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <>
      <input type="hidden" name={name} value={currentValue} />
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger
          id={triggerId}
          type="button"
          disabled={disabled}
          data-slot="person-dropdown-trigger"
          data-placeholder={isPlaceholder ? '' : undefined}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-expanded={open}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:hover:bg-input/50',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {describePerson && !isPlaceholder && <Avatar name={triggerLabel} size="sm" />}
            <span className="line-clamp-1 text-left">{triggerLabel}</span>
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground opacity-50" />
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) min-w-[12rem] p-0"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={event => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={m.person_dropdown_search_placeholder()}
              className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
              role="combobox"
              aria-controls={listboxId}
              aria-expanded={open}
              aria-activedescendant={
                items[activeIndex] ? `${listboxId}-${items[activeIndex].kind}-${items[activeIndex].id}` : undefined
              }
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
            />
          </div>
          <div ref={listRef} id={listboxId} role="listbox" className="max-h-72 overflow-y-auto p-1">
            {items.length === 0 ? (
              <div className="px-2 py-6 text-center text-muted-foreground text-sm">
                {people.length === 0 ? (emptyState ?? m.person_dropdown_empty()) : m.person_dropdown_no_results()}
              </div>
            ) : (
              items.map((item, index) => {
                const isActive = index === activeIndex
                const isSelected =
                  item.kind === 'none' ? currentValue === NONE_VALUE : currentValue === item.id.toString()
                const aside = item.description?.setAside
                // A label between options, outside the items the keyboard walks: each set-aside person says why
                // in their own facts line, so the label is only for the eye.
                const opensGroup = aside != null && items[index - 1]?.description?.setAside !== aside
                return (
                  <Fragment key={`${item.kind}-${item.id}`}>
                    {opensGroup && (
                      <div aria-hidden="true" className="mt-1 border-border border-t px-2 pt-2 pb-1 text-faint text-xs">
                        {aside}
                      </div>
                    )}
                    <button
                      id={`${listboxId}-${item.kind}-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={item.disabled}
                      disabled={item.disabled}
                      title={item.reason}
                      data-active={isActive}
                      data-selected={isSelected}
                      onClick={() => selectIndex(index)}
                      onMouseEnter={() => {
                        if (!item.disabled) setActiveIndex(index)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
                        'data-[active=true]:bg-accent data-[active=true]:text-accent-foreground',
                        'data-[selected=true]:font-medium',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        item.kind === 'none' && 'text-muted-foreground italic',
                        aside != null && 'opacity-70',
                      )}
                    >
                      {describePerson && item.kind === 'person' ? (
                        <span className="flex min-w-0 flex-1 items-center gap-2.5">
                          <Avatar name={item.label} size="sm" />
                          <span className="flex min-w-0 flex-col">
                            <span className="line-clamp-1">{item.label}</span>
                            {item.description?.facts && (
                              <span className="flex items-center gap-1.5 font-normal text-faint text-xs">
                                {item.description.tone && (
                                  <StatusIcon tone={item.description.tone} className="size-2.5 flex-none" />
                                )}
                                <span className="line-clamp-1">{item.description.facts}</span>
                              </span>
                            )}
                          </span>
                        </span>
                      ) : (
                        <span className="line-clamp-1">{item.label}</span>
                      )}
                      {item.reason && (
                        <span className="ml-2 shrink-0 text-muted-foreground text-xs">{item.reason}</span>
                      )}
                    </button>
                  </Fragment>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}

type ItemLike = { disabled: boolean }

function findNextEnabled<T extends ItemLike>(items: T[], from: number, direction: 1 | -1): number {
  if (items.length === 0) return 0
  let index = from
  let remaining = items.length
  while (remaining > 0) {
    index = (index + direction + items.length) % items.length
    if (!items[index]?.disabled) return index
    remaining -= 1
  }
  return Math.max(0, from)
}
