import { Callout } from '@unitae/ui'
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useFetcher, useNavigate } from 'react-router'
import { scheduleTemplateDeleteLines } from '~/features/settings/model/schedule-template-delete-lines'
import type { ScheduleTemplateView } from '~/features/settings/model/schedule-template-view'
import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'

type Template = Pick<ScheduleTemplateView, 'id' | 'kind' | 'title' | 'kinds' | 'schedules' | 'responsible'>

/**
 * The template's « … » in its panel: « Dupliquer », which opens the copy, and « Supprimer le modèle » (design round A,
 * « TourA-Modeles-Dialogues »): the
 * dialog says what goes and what stays, the kinds that use it, the schedules made from it and who answers for them
 * after. Once deleted, the panel closes.
 */
export function ScheduleTemplateDeleteMenu({ template, onDeleted }: { template: Template; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const fetcher = useFetcher<{ ok: true } | { ok: false; errors: string[] }>({
    key: `schedule-template-${template.id}-delete-template`,
  })
  // Acted on once per answer: deleted, the panel goes; refused, the dialog says why.
  const handled = useRef<unknown>(null)
  const answer = fetcher.state === 'idle' ? fetcher.data : undefined
  useEffect(() => {
    if (answer == null || answer === handled.current || answer.ok !== true) return
    handled.current = answer
    setOpen(false)
    onDeleted()
  }, [answer, onDeleted])
  const errors = answer?.ok === false && answer !== handled.current ? answer.errors : null

  const lines = scheduleTemplateDeleteLines(template)
  // « Dupliquer »: the copy opens in the panel once it exists (user, 2026-11-27).
  const navigate = useNavigate()
  const copier = useFetcher<{ ok: true; id: number } | { ok: false; errors: string[] }>({
    key: `schedule-template-${template.id}-duplicate`,
  })
  const copied = copier.state === 'idle' ? copier.data : undefined
  const opened = useRef<unknown>(null)
  useEffect(() => {
    if (copied == null || copied === opened.current || copied.ok !== true) return
    opened.current = copied
    navigate(`?template=${copied.id}`)
  }, [copied, navigate])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.settings_schedule_templates_actions()}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={copier.state !== 'idle'}
            onSelect={() => copier.submit({ intent: 'duplicate-template' }, { method: 'post' })}
          >
            {m.settings_schedule_templates_duplicate()}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setOpen(true)}>
            {m.settings_schedule_templates_delete()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent
          onCloseAutoFocus={event => {
            // Back to the « … » that opened it, or, the template gone with its panel, to the list.
            const target = trigger.current?.isConnected
              ? trigger.current
              : document.querySelector<HTMLElement>('[data-row-primary]')
            if (target == null) return
            event.preventDefault()
            target.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{m.settings_schedule_templates_delete_title({ name: template.title })}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-left">
                <ul className="list-disc space-y-1 pl-4">
                  {lines.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p>{m.settings_schedule_templates_delete_final()}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errors && <Callout tone="danger" role="alert" title={errors.join(' ')} />}
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={fetcher.state !== 'idle'}
              onClick={() => fetcher.submit({ intent: 'delete-template' }, { method: 'post' })}
            >
              {m.settings_schedule_templates_delete()}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
