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
 * A section's header in a schedule template's list, with its « … » menu: rename it in place (on every part in it), and
 * « Supprimer » shown disabled with its reason, since a section goes once its last part does.
 */
export function PartGroupHeader({
  name,
  meta,
  taken,
  handle,
  readOnly = false,
}: {
  name: string
  /** Its time, after the name. */
  meta: string
  /** The template's other sections: one of them would merge. */
  taken: readonly string[]
  /** What moves the section (a grip, or « Monter » / « Descendre »), before its name. */
  handle?: ReactNode
  /** While reordering: no « … » menu (the name, its time and the handle stay). */
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
  const next = value.trim()
  const clash = next !== name && taken.includes(next)
  const refusal =
    fetcher.state === 'idle' && fetcher.data != null && sent === next
      ? [...(fetcher.data.errors ?? []), ...Object.values(fetcher.data.error ?? {}).flatMap(each => each ?? [])]
      : []
  const message = clash ? m.settings_schedule_templates_section_taken() : refusal.join(' ')

  if (editing) {
    return (
      <fetcher.Form
        method="post"
        // The phone's sheet hears Escape first: this mark tells it the rename takes it, not the panel.
        data-own-escape=""
        className="flex flex-col gap-1 border-border border-b bg-subtle px-2 py-1.5"
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
          <input type="hidden" name="intent" value="rename-section" />
          <input type="hidden" name="from" value={name} />
          <label htmlFor={inputId} className="sr-only">
            {m.settings_schedule_templates_section_name()}
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
        'group/header flex items-center gap-2 border-border border-b bg-subtle py-1 pr-1',
        handle == null ? 'pl-3' : 'pl-0',
      )}
    >
      {handle}
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 py-1.5 text-xs">
        <span className="font-semibold text-foreground text-sm">{name}</span>
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
              aria-label={m.settings_schedule_templates_section_actions({ name })}
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
