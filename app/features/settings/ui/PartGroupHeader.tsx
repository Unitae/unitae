import { Check, MoreHorizontal, X } from 'lucide-react'
import { useId, useState } from 'react'
import { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Input } from '~/shared/ui/input'
import { cn } from '~/shared/utils/utils'

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
}: {
  level: 'section' | 'hall'
  name: string
  /** A hall's section. */
  section?: string
  /** Its time and halls, after the name. */
  meta: string
  /** A section's « Ajouter une salle en parallèle ». */
  onAddHall?: () => void
}) {
  const fetcher = useFetcher()
  const [editing, setEditing] = useState(false)
  const inputId = useId()
  useCloseOnSave(fetcher, () => setEditing(false))
  const isSection = level === 'section'

  if (editing) {
    return (
      <fetcher.Form
        method="post"
        className={cn('flex items-center gap-1.5 border-border border-b px-2 py-1.5', isSection ? 'bg-subtle' : 'pl-5')}
        onKeyDown={event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          setEditing(false)
        }}
      >
        <input type="hidden" name="intent" value={isSection ? 'rename-section' : 'rename-hall'} />
        <input type="hidden" name="from" value={name} />
        {!isSection && <input type="hidden" name="section" value={section ?? ''} />}
        <label htmlFor={inputId} className="sr-only">
          {isSection ? m.settings_schedule_templates_section_name() : m.settings_schedule_templates_hall_name()}
        </label>
        {/* biome-ignore lint/a11y/noAutofocus: the rename the person just asked for */}
        <Input id={inputId} name="to" defaultValue={name} maxLength={80} autoFocus required className="h-8 flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={m.common_cancel()}
          onClick={() => setEditing(false)}
        >
          <X aria-hidden="true" />
        </Button>
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          aria-label={m.settings_schedule_templates_rename()}
          disabled={fetcher.state !== 'idle'}
        >
          <Check aria-hidden="true" />
        </Button>
      </fetcher.Form>
    )
  }

  return (
    <div
      className={cn(
        'group/header flex items-center gap-2 border-border border-b',
        isSection ? 'bg-subtle py-1 pr-1 pl-3' : 'py-0.5 pr-1 pl-6',
      )}
    >
      <span
        className={cn('flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2', isSection ? 'py-1.5 text-xs' : 'text-xs')}
      >
        <span className={isSection ? 'font-semibold text-foreground text-sm' : 'text-muted-foreground'}>{name}</span>
        {meta !== '' && <span className="text-muted-foreground tabular-nums">{meta}</span>}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
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
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            {m.settings_schedule_templates_rename()}
          </DropdownMenuItem>
          {onAddHall != null && (
            <DropdownMenuItem onSelect={onAddHall}>{m.settings_schedule_templates_add_hall()}</DropdownMenuItem>
          )}
          <DropdownMenuItem disabled>{m.settings_schedule_templates_delete_when_empty()}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
