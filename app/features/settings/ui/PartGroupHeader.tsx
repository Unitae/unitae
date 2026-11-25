import { Check, MoreHorizontal, X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { Input } from '~/shared/ui/input'
import { cn } from '~/shared/utils/utils'
import { useOnSettled } from './use-on-settled'

/**
 * A section's or a hall's header in a schedule template's list, with its « … » menu: rename it in place (on every part
 * in it), add a parallel hall to a section, and « Supprimer » shown disabled with its reason, since a section or a hall
 * goes once its last part does.
 */
export function PartGroupHeader({
  level,
  name,
  section,
  meta,
  onAddHall,
  taken,
  handle,
  readOnly = false,
}: {
  level: 'section' | 'hall'
  name: string
  /** A hall's section. */
  section?: string
  /** Its time and halls, after the name. */
  meta: string
  /** A section's « Ajouter une salle en parallèle ». */
  onAddHall?: () => void
  /** The other names in use (the template's other sections, or the section's other halls): one of them would merge. */
  taken: readonly string[]
  /** What moves the section (a grip, or « Monter » / « Descendre »), before its name. */
  handle?: ReactNode
  /** While reordering: the name only, no « … » menu. */
  readOnly?: boolean
}) {
  const fetcher = useFetcher<{ errors?: string[]; error?: Record<string, string[] | null> }>()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  // The name last sent: a refusal shows while the input still holds it, not once it is changed or reopened.
  const [sent, setSent] = useState<string | null>(null)
  const inputId = useId()
  const errorId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  // Back on the « … » button once the rename closes, saved or cancelled: focus stays in the panel, Escape with it.
  const refocus = useRef(false)
  const close = () => {
    refocus.current = true
    setEditing(false)
  }
  useOnSettled(fetcher, close)
  useEffect(() => {
    if (editing || !refocus.current) return
    refocus.current = false
    trigger.current?.focus()
  }, [editing])
  const isSection = level === 'section'
  const next = value.trim()
  const clash = next !== name && taken.includes(next)
  const refusal =
    fetcher.state === 'idle' && fetcher.data != null && sent === next
      ? [...(fetcher.data.errors ?? []), ...Object.values(fetcher.data.error ?? {}).flatMap(each => each ?? [])]
      : []
  const message = clash
    ? isSection
      ? m.settings_schedule_templates_section_taken()
      : m.settings_schedule_templates_hall_taken()
    : refusal.join(' ')

  if (editing) {
    return (
      <fetcher.Form
        method="post"
        // The phone's sheet hears Escape first: this mark tells it the rename takes it, not the panel.
        data-own-escape=""
        className={cn('flex flex-col gap-1 border-border border-b px-2 py-1.5', isSection ? 'bg-subtle' : 'pl-5')}
        onKeyDown={event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          close()
        }}
        onSubmit={event => {
          // The same name closes; a blank one or a clash is not sent.
          if (next === name) {
            event.preventDefault()
            close()
          } else if (next === '' || clash) event.preventDefault()
          else setSent(next)
        }}
      >
        <div className="flex items-center gap-1.5">
          <input type="hidden" name="intent" value={isSection ? 'rename-section' : 'rename-hall'} />
          <input type="hidden" name="from" value={name} />
          {!isSection && <input type="hidden" name="section" value={section ?? ''} />}
          <label htmlFor={inputId} className="sr-only">
            {isSection ? m.settings_schedule_templates_section_name() : m.settings_schedule_templates_hall_name()}
          </label>
          {/* biome-ignore lint/a11y/noAutofocus: the rename the person just asked for */}
          <Input
            id={inputId}
            name="to"
            value={value}
            onChange={event => setValue(event.target.value)}
            maxLength={80}
            autoFocus
            required
            aria-invalid={message !== '' || undefined}
            aria-describedby={message !== '' ? errorId : undefined}
            className="h-8 flex-1"
          />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={m.common_cancel()} onClick={close}>
            <X aria-hidden="true" />
          </Button>
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            aria-label={m.settings_schedule_templates_rename()}
            disabled={fetcher.state !== 'idle' || next === '' || clash}
          >
            <Check aria-hidden="true" />
          </Button>
        </div>
        {message !== '' && (
          <p id={errorId} role="alert" className="px-1 text-danger-text text-xs">
            {message}
          </p>
        )}
      </fetcher.Form>
    )
  }

  return (
    <div
      className={cn(
        'group/header flex items-center gap-2 border-border border-b',
        isSection ? 'bg-subtle py-1 pr-1' : 'py-0.5 pr-1 pl-6',
        isSection && (handle == null ? 'pl-3' : 'pl-0'),
      )}
    >
      {handle}
      <span
        className={cn('flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2', isSection ? 'py-1.5 text-xs' : 'text-xs')}
      >
        <span className={isSection ? 'font-semibold text-foreground text-sm' : 'text-muted-foreground'}>{name}</span>
        {meta !== '' && <span className="text-muted-foreground tabular-nums">{meta}</span>}
      </span>
      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={trigger}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={
                isSection
                  ? m.settings_schedule_templates_section_actions({ name })
                  : m.settings_schedule_templates_hall_actions({ name })
              }
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setValue(name)
                setSent(null)
                setEditing(true)
              }}
            >
              {m.settings_schedule_templates_rename()}
            </DropdownMenuItem>
            {onAddHall != null && (
              <DropdownMenuItem onSelect={onAddHall}>{m.settings_schedule_templates_add_hall()}</DropdownMenuItem>
            )}
            {/* Reachable with the arrow keys, unlike a disabled item, so its reason is read; choosing it does nothing. */}
            <DropdownMenuItem
              aria-disabled="true"
              className="text-muted-foreground"
              onSelect={event => event.preventDefault()}
            >
              {m.settings_schedule_templates_delete_when_empty()}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
