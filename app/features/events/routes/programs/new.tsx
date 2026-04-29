import { parseWithZod } from '@conform-to/zod'
import { useMemo, useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { computeDatesForWeekdayCount } from '~/features/events/model/compute-dates'
import { dayLabel } from '~/features/events/model/day-label'
import {
  freeformEventSchema,
  recurringEventSchema,
  singleEventSchema,
} from '~/features/events/schemas/program-new.schema'
import { createFreeformEvent } from '~/features/events/server/programme-events.server'
import {
  createSingleEventFromTemplate,
  generateEventsFromTemplate,
} from '~/features/events/server/programme-generation.server'
import { getTemplates } from '~/features/events/server/programme-templates.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { useUnsavedChanges } from '~/shared/hooks/use-unsaved-changes'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

import type { Route } from './+types/new'

const NO_TEMPLATE = 'none'
const OCCURRENCE_PRESETS = [
  { value: 4, label: '1 m.' },
  { value: 8, label: '2 m.' },
  { value: 13, label: '3 m.' },
  { value: 26, label: '6 m.' },
  { value: 52, label: '1 an' },
]

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_new_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.ProgramManager)) throw redirect('/programs')

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const [templates, eventKinds] = await Promise.all([
      getTemplates(db, congregationId),
      db.eventKind.findMany({ where: { congregationId, NOT: { key: 'off' } }, orderBy: { name: 'asc' } }),
    ])
    return { templates, eventKinds }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.ProgramManager)) throw redirect('/programs')

  const currentUser = context.get(userContext)
  const session = await getSession(request.headers.get('Cookie'))
  const formData = await request.formData()
  const mode = formData.get('mode')
  const { congregationId } = currentUser

  return withScopeFromContext(context, async db => {
    if (mode === 'recurring') {
      const submission = parseWithZod(formData, { schema: recurringEventSchema })
      if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

      const { templateId, occurrences, startDate } = submission.value
      const startFrom = startDate ? new Date(startDate) : undefined
      const events = await generateEventsFromTemplate(db, templateId, occurrences, currentUser.id, congregationId, startFrom)
      logger.info(`Generated ${events.length} events from template ${templateId}. User ID: ${currentUser.id}.`)

      session.flash(
        'success',
        events.length > 0
          ? m.programs_new_generated_success({ count: events.length })
          : m.programs_new_generated_none(),
      )
    }

    if (mode === 'single') {
      const submission = parseWithZod(formData, { schema: singleEventSchema })
      if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

      const { templateId, date } = submission.value
      const event = await createSingleEventFromTemplate(db, templateId, new Date(date), currentUser.id, congregationId)
      logger.info(`Created single event from template ${templateId}. User ID: ${currentUser.id}.`)

      if (!event) {
        return data({ alreadyExists: true }, { status: 409 })
      }

      session.flash('success', m.programs_new_created_success())
    }

    if (mode === 'freeform') {
      const submission = parseWithZod(formData, { schema: freeformEventSchema })
      if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

      const { name, date, startTime, endTime, kindId } = submission.value

      const [startHour, startMin] = startTime.split(':').map(Number)
      const [endHour, endMin] = endTime.split(':').map(Number)

      const startDate = new Date(date)
      startDate.setHours(startHour ?? 19, startMin ?? 0, 0, 0)
      const endDate = new Date(date)
      endDate.setHours(endHour ?? 21, endMin ?? 0, 0, 0)

      await createFreeformEvent(db, {
        name,
        startDate,
        endDate,
        createdById: currentUser.id,
        congregationId,
        kindId,
      })

      logger.info(`Created freeform event "${name}". User ID: ${currentUser.id}.`)
      session.flash('success', m.programs_new_created_success())
    }

    return redirect('/programs', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

function groupByMonth(dates: Date[]): Record<string, Date[]> {
  const result: Record<string, Date[]> = {}
  for (const d of dates) {
    const key = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    const entry = result[key]
    if (entry) entry.push(d)
    else result[key] = [d]
  }
  return result
}

export default function NewEventPage({ loaderData, actionData }: Route.ComponentProps) {
  const { templates, eventKinds } = loaderData
  const [selectedValue, setSelectedValue] = useState<string>('')
  const [occurrences, setOccurrences] = useState(8)
  const [startDate, setStartDate] = useState('')
  const { blocker, markDirty } = useUnsavedChanges()

  const isNoTemplate = selectedValue === NO_TEMPLATE
  const selectedTemplate = !isNoTemplate ? templates.find(t => t.id === Number(selectedValue)) : null
  const isRecurring = selectedTemplate?.weekDay != null
  const showForm = isNoTemplate || selectedTemplate != null

  const previewDates = useMemo(() => {
    if (!selectedTemplate || !isRecurring || selectedTemplate.weekDay == null) return []
    const startFrom = startDate ? new Date(startDate) : undefined
    return computeDatesForWeekdayCount(selectedTemplate.weekDay, occurrences, startFrom)
  }, [selectedTemplate, isRecurring, occurrences, startDate])

  const previewByMonth = useMemo(() => groupByMonth(previewDates), [previewDates])

  function handleSetOccurrences(n: number) {
    setOccurrences(n)
    markDirty()
  }

  const alreadyExists = (actionData as { alreadyExists?: boolean } | undefined)?.alreadyExists === true

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.programs_new_page_title()}
        subtitle={m.programs_new_page_subtitle()}
        breadcrumbs={[{ label: m.sidebar_programs(), to: '/programs' }, { label: m.programs_new_page_title() }]}
        backTo="/programs"
      />

      <Card className={isRecurring ? 'max-w-2xl' : 'max-w-lg'}>
        <CardHeader>
          <CardTitle className="text-base">{m.programs_new_config_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4" onChange={markDirty}>
            {/* Template selector */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="templateId">{m.programs_new_template_label()}</Label>
              {templates.length === 0 && (
                <p className="text-muted-foreground text-xs">{m.programs_new_no_templates_hint()}</p>
              )}
              <Select
                name={isNoTemplate ? undefined : 'templateId'}
                value={selectedValue}
                onValueChange={v => { setSelectedValue(v); markDirty() }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={m.programs_new_select_template()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>{m.programs_new_no_template_option()}</SelectItem>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.name}
                      {template.weekDay != null ? ` (${dayLabel(template.weekDay)})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Template summary line */}
              {selectedTemplate && (
                <p className="text-muted-foreground text-xs">
                  {isRecurring
                    ? `Modèle récurrent · ${dayLabel(selectedTemplate.weekDay ?? 0)}s · 19h00–21h00`
                    : 'Modèle unique'}
                </p>
              )}
            </div>

            {/* Free-form mode */}
            {isNoTemplate && (
              <>
                <input type="hidden" name="mode" value="freeform" />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">{m.programs_new_event_name_label()}</Label>
                  <Input id="name" name="name" placeholder={m.programs_new_event_name_placeholder()} required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="date">{m.programs_new_date_label()}</Label>
                  <Input id="date" name="date" type="date" min={new Date().toISOString().split('T')[0]} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="startTime">{m.programs_new_start_time_label()}</Label>
                    <Input id="startTime" name="startTime" type="time" defaultValue="19:00" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="endTime">{m.programs_new_end_time_label()}</Label>
                    <Input id="endTime" name="endTime" type="time" defaultValue="21:00" />
                  </div>
                </div>
                {eventKinds.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="kindId">{m.programs_new_kind_label()}</Label>
                    <Select name="kindId">
                      <SelectTrigger id="kindId">
                        <SelectValue placeholder={m.programs_new_kind_placeholder()} />
                      </SelectTrigger>
                      <SelectContent>
                        {eventKinds.map(kind => (
                          <SelectItem key={kind.id} value={kind.id.toString()}>
                            {kind.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {/* Recurring mode */}
            {selectedTemplate && isRecurring && (
              <>
                <input type="hidden" name="mode" value="recurring" />

                {/* Presets */}
                <div className="flex flex-col gap-2">
                  <Label>{m.programs_new_occurrences_presets_label()}</Label>
                  <div className="flex flex-wrap gap-2">
                    {OCCURRENCE_PRESETS.map(preset => (
                      <Button
                        key={preset.value}
                        type="button"
                        variant={occurrences === preset.value ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => handleSetOccurrences(preset.value)}
                      >
                        {preset.value} <span className="text-muted-foreground ml-1">{preset.label}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Occurrence count input */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="occurrences">{m.programs_new_occurrences_label()}</Label>
                  <Input
                    id="occurrences"
                    name="occurrences"
                    type="number"
                    min={1}
                    max={52}
                    value={occurrences}
                    onChange={e => setOccurrences(Number(e.target.value))}
                    onBlur={e => handleSetOccurrences(Math.max(1, Math.min(52, Number(e.target.value))))}
                    className="w-20"
                  />
                </div>

                {/* Optional start date */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="recurringStartDate">{m.programs_new_start_date_label()}</Label>
                  <Input
                    id="recurringStartDate"
                    name="startDate"
                    type="date"
                    value={startDate}
                    onChange={e => { setStartDate(e.target.value); markDirty() }}
                    className="w-auto"
                  />
                </div>

                {/* Date preview */}
                {previewDates.length > 0 && (
                  <div className="border-l-2 border-primary/30 pl-3">
                    <p className="mb-2 text-muted-foreground text-xs">{m.programs_new_occurrences_preview_label()}</p>
                    <div className="flex flex-col gap-1.5">
                      {Object.entries(previewByMonth).map(([month, dates]) => (
                        <div key={month} className="flex flex-wrap items-baseline gap-1.5">
                          <span className="w-24 shrink-0 capitalize text-muted-foreground text-xs">{month}</span>
                          {dates.map(d => (
                            <span
                              key={d.toISOString()}
                              className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums"
                            >
                              {d.toLocaleDateString('fr-FR', { day: 'numeric' })}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Single (non-recurring) template mode */}
            {selectedTemplate && !isRecurring && (
              <>
                <input type="hidden" name="mode" value="single" />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="date">{m.programs_new_event_date_label()}</Label>
                  <Input id="date" name="date" type="date" min={new Date().toISOString().split('T')[0]} required />
                  {alreadyExists && (
                    <p className="text-destructive text-sm">{m.programs_new_already_exists()}</p>
                  )}
                </div>
              </>
            )}

            {/* Submit row */}
            {showForm && (
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="ghost" asChild>
                  <Link to="/programs">{m.common_cancel()}</Link>
                </Button>
                <SubmitButton>
                  {isNoTemplate && m.programs_new_create_event()}
                  {selectedTemplate && isRecurring && m.programs_new_generate_events({ count: occurrences })}
                  {selectedTemplate && !isRecurring && m.programs_new_create_event()}
                </SubmitButton>
              </div>
            )}
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
