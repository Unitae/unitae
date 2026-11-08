import { Plus, X } from 'lucide-react'
import { type KeyboardEvent, useId, useRef, useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName, type RoleOption } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~/shared/ui/popover'
import { cn } from '~/shared/utils/utils'

interface RoleChipsProps {
  roles: RoleOption[]
  selectedIds: number[]
  /** The form field: one hidden input per chosen role, under this name. */
  name: string
  /** What applies while no role is chosen, e.g. « Proclamateur (par défaut) ». */
  defaultLabel: string
  /** When provided, the field is controlled: the chosen roles live in the parent. */
  onChange?: (next: number[]) => void
  /** Element id whose text labels the field, for screen readers. */
  labelledBy?: string
}

const DIACRITICS = /\p{Diacritic}/gu
const normalize = (value: string) => value.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim()

/**
 * The roles allowed for something: the chosen ones as chips, the others behind « Ajouter un rôle » with a search.
 * While none is chosen the default shows as a faint chip without a remove button: removing it would change nothing.
 */
export function RoleChips({ roles, selectedIds, name, defaultLabel, onChange, labelledBy }: RoleChipsProps) {
  const [internal, setInternal] = useState(selectedIds)
  const chosenIds = new Set(onChange ? selectedIds : internal)
  const chosen = roles.filter(role => chosenIds.has(role.id))
  const available = roles.filter(role => !chosenIds.has(role.id))
  const addButton = useRef<HTMLButtonElement>(null)

  function update(next: number[]) {
    if (onChange) onChange(next)
    else setInternal(next)
  }

  function remove(id: number) {
    update([...chosenIds].filter(chosenId => chosenId !== id))
    // The chip and its button are gone: keep the keyboard where the list continues.
    requestAnimationFrame(() => addButton.current?.focus())
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would need a legend; the visible label names the group
    <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap items-center gap-1.5">
      {chosen.map(role => (
        <input key={role.id} type="hidden" name={name} value={role.id} />
      ))}
      {chosen.length === 0 && (
        <span
          aria-hidden="true"
          className="inline-flex h-7 items-center rounded-md border border-border border-dashed px-2.5 text-faint text-sm"
        >
          {defaultLabel}
        </span>
      )}
      <span className="sr-only" aria-live="polite">
        {chosen.length === 0 ? defaultLabel : chosen.map(role => getRoleDisplayName(role)).join(', ')}
      </span>
      {chosen.map(role => (
        <span
          key={role.id}
          data-builtin={role.isBuiltIn}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-hover pr-1 pl-2.5 text-sm"
        >
          {getRoleDisplayName(role)}
          <button
            type="button"
            aria-label={m.role_chips_remove({ role: getRoleDisplayName(role) })}
            onClick={() => remove(role.id)}
            className="grid size-5 place-content-center rounded text-faint outline-none transition-colors hover:bg-border hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {available.length > 0 && (
        <AddRoleMenu roles={available} triggerRef={addButton} onPick={id => update([...chosenIds, id])} />
      )}
    </div>
  )
}

function AddRoleMenu({
  roles,
  triggerRef,
  onPick,
}: {
  roles: RoleOption[]
  triggerRef: React.RefObject<HTMLButtonElement | null>
  onPick: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()

  const matches = roles.filter(role => normalize(getRoleDisplayName(role)).includes(normalize(query)))
  const activeIndex = Math.min(active, matches.length - 1)

  function pick(id: number) {
    onPick(id)
    // Stays open for the next role: allowing several is the common case.
    setQuery('')
    setActive(0)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (matches.length === 0) return
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActive((activeIndex + delta + matches.length) % matches.length)
    } else if (event.key === 'Enter') {
      // Never submits the form around the field.
      event.preventDefault()
      const match = matches[activeIndex]
      if (match) pick(match.id)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next)
        setQuery('')
        setActive(0)
      }}
    >
      <PopoverTrigger asChild>
        <Button ref={triggerRef} type="button" variant="ghost" size="sm" className="h-7">
          <Plus />
          {m.role_chips_add()}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <input
          type="text"
          role="combobox"
          aria-label={m.role_chips_search()}
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={matches[activeIndex] ? `${listId}-${matches[activeIndex].id}` : undefined}
          autoComplete="off"
          placeholder={m.role_chips_search()}
          value={query}
          onChange={event => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          className="h-8 w-full rounded-sm bg-transparent px-2 text-sm outline-none placeholder:text-faint"
        />
        {matches.length === 0 && (
          <p className="mt-1 border-border border-t px-2 pt-2 pb-1.5 text-faint text-sm">{m.role_chips_no_match()}</p>
        )}
        <div
          id={listId}
          role="listbox"
          aria-label={m.role_chips_add()}
          className={cn('max-h-64 overflow-y-auto', matches.length > 0 && 'mt-1 border-border border-t pt-1')}
        >
          {matches.map((role, index) => (
            <button
              key={role.id}
              id={`${listId}-${role.id}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={index === activeIndex}
              onMouseDown={event => event.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => pick(role.id)}
              className={cn(
                'flex w-full cursor-default rounded-sm px-2 py-1.5 text-left text-sm',
                index === activeIndex && 'bg-hover text-foreground',
              )}
            >
              {getRoleDisplayName(role)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
