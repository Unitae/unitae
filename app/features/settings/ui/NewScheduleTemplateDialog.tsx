import { Callout, SegmentedControl } from '@unitae/ui'
import { useEffect, useId, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { NO_RESPONSIBLE } from '~/features/settings/schemas/schedule-template.schema'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

interface NewScheduleTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The roles a template may be handed to. */
  roles: { id: number; label: string }[]
  /** Where focus goes back once it closes: the button that opened it. */
  returnFocus?: () => HTMLElement | null
}

/**
 * « Nouveau modèle » (design round A, « TourA-Modeles-Dialogues »): its name, what it holds and who answers for it. Once
 * created it opens in the panel, where its parts or services are added; no kind uses it yet, « Ajouter un planning »
 * offers it on the meetings.
 */
export function NewScheduleTemplateDialog({ open, onOpenChange, roles, returnFocus }: NewScheduleTemplateDialogProps) {
  // A fetcher of its own per opening: a refusal from an earlier one never shows on the next.
  const [opening, setOpening] = useState(0)
  const fetcher = useFetcher<{ ok: false; errors: string[] }>({ key: `new-schedule-template-${opening}` })
  const id = useId()
  const [kind, setKind] = useState<'programme' | 'duty'>('programme')
  const [role, setRole] = useState(NO_RESPONSIBLE)
  const errors = fetcher.state === 'idle' && fetcher.data?.ok === false ? fetcher.data.errors : null

  // Each opening starts afresh.
  useEffect(() => {
    if (!open) return
    setOpening(each => each + 1)
    setKind('programme')
    setRole(NO_RESPONSIBLE)
  }, [open])

  // Created: the answer is a redirect to the page with the template open, which brings no data, so the data the
  // submission found stays as it was; a refusal brings its own. Only a new refusal keeps the dialog open.
  const sent = useRef<{ data: unknown } | null>(null)
  useEffect(() => {
    if (fetcher.state === 'submitting' && sent.current == null) sent.current = { data: fetcher.data }
    if (fetcher.state !== 'idle' || sent.current == null) return
    const refused = fetcher.data !== sent.current.data && fetcher.data?.ok === false
    sent.current = null
    if (!refused) onOpenChange(false)
  }, [fetcher.state, fetcher.data, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={event => {
          const target = returnFocus?.()
          if (target == null) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{m.settings_schedule_templates_new_title()}</DialogTitle>
        </DialogHeader>
        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="create-template" />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="responsibleRoleId" value={role} />
          {errors && <Callout tone="danger" role="alert" title={errors.join(' ')} />}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>{m.settings_schedule_templates_name()}</Label>
            <Input id={`${id}-name`} name="name" maxLength={80} required autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span aria-hidden="true" className="text-sm font-medium">
              {m.settings_schedule_templates_new_contents()}
            </span>
            <SegmentedControl
              aria-label={m.settings_schedule_templates_new_contents()}
              value={kind}
              onValueChange={value => setKind(value === 'duty' ? 'duty' : 'programme')}
              options={[
                { value: 'programme', label: m.settings_schedule_templates_new_parts() },
                { value: 'duty', label: m.settings_schedule_templates_new_services() },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-responsible`}>{m.settings_schedule_templates_responsible()}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id={`${id}-responsible`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_RESPONSIBLE}>{m.settings_schedule_templates_new_responsible_none()}</SelectItem>
                {roles.map(each => (
                  <SelectItem key={each.id} value={String(each.id)}>
                    {each.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-muted-foreground text-sm">
            {kind === 'duty'
              ? m.settings_schedule_templates_new_hint_duty()
              : m.settings_schedule_templates_new_hint_programme()}
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {m.common_cancel()}
            </Button>
            <Button type="submit" disabled={fetcher.state !== 'idle'}>
              {m.settings_schedule_templates_create()}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  )
}
