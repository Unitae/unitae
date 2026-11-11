import { getFormProps, getInputProps, type SubmissionResult, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { useFetcher } from 'react-router'
import { dayLabel } from '~/features/events'
import { createTemplateSchema } from '~/features/settings/schemas/template.schema'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { Input } from '~/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { SettingsField } from './SettingsField'

const WEEK = [1, 2, 3, 4, 5, 6, 0]

/** Creates a template from its name, day and times; its page opens to fill it in. */
export function NewTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const fetcher = useFetcher<SubmissionResult<string[]>>()
  const [form, fields] = useForm({
    lastResult: fetcher.state === 'idle' ? fetcher.data : undefined,
    shouldValidate: 'onBlur',
    onValidate: ({ formData }) => parseWithZod(formData, { schema: createTemplateSchema }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.settings_templates_new_button()}</DialogTitle>
          <DialogDescription>{m.settings_templates_new_description()}</DialogDescription>
        </DialogHeader>
        <fetcher.Form
          method="post"
          action="/settings/templates/new"
          {...getFormProps(form)}
          className="flex flex-col gap-4"
        >
          <SettingsField id={fields.name.id} label={m.common_name()} error={fields.name.errors?.[0]}>
            <Input
              {...getInputProps(fields.name, { type: 'text' })}
              placeholder={m.settings_template_new_name_placeholder()}
              autoComplete="off"
            />
          </SettingsField>
          <SettingsField id={fields.weekDay.id} label={m.settings_template_edit_weekday_label()}>
            <Select name={fields.weekDay.name} defaultValue="none">
              <SelectTrigger id={fields.weekDay.id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{m.settings_templates_one_time()}</SelectItem>
                {WEEK.map(day => (
                  <SelectItem key={day} value={String(day)}>
                    {dayLabel(day)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsField>
          <div className="grid grid-cols-2 gap-3">
            <SettingsField
              id={fields.startTime.id}
              label={m.settings_template_edit_start_time_label()}
              error={fields.startTime.errors?.[0]}
            >
              <Input {...getInputProps(fields.startTime, { type: 'time' })} defaultValue="19:00" />
            </SettingsField>
            <SettingsField
              id={fields.endTime.id}
              label={m.settings_template_edit_end_time_label()}
              error={fields.endTime.errors?.[0]}
            >
              <Input {...getInputProps(fields.endTime, { type: 'time' })} defaultValue="21:00" />
            </SettingsField>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {m.common_cancel()}
            </Button>
            <Button type="submit" disabled={fetcher.state !== 'idle'}>
              {m.settings_templates_new_submit()}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  )
}
