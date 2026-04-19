import { parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
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
import logger from '~/shared/infra/logger.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

import type { Route } from './+types/new'

const NO_TEMPLATE = 'none'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_new_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.ProgramManager)) throw redirect('/congregation/programs')

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const templates = await getTemplates(db, congregationId)
    return { templates }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.ProgramManager)) throw redirect('/congregation/programs')

  const currentUser = context.get(userContext)
  const session = await getSession(request.headers.get('Cookie'))
  const formData = await request.formData()
  const mode = formData.get('mode')
  const { congregationId } = currentUser

  return withScopeFromContext(context, async db => {
    if (mode === 'recurring') {
      const submission = parseWithZod(formData, { schema: recurringEventSchema })
      if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

      const { templateId } = submission.value
      const events = await generateEventsFromTemplate(db, templateId, 2, currentUser.id, congregationId)
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

      if (event) {
        session.flash('success', m.programs_new_created_success())
      } else {
        session.flash('error', m.programs_new_already_exists())
      }
    }

    if (mode === 'freeform') {
      const submission = parseWithZod(formData, { schema: freeformEventSchema })
      if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

      const { name, date } = submission.value

      const startDate = new Date(date)
      startDate.setHours(19, 0, 0, 0)
      const endDate = new Date(date)
      endDate.setHours(21, 0, 0, 0)

      await createFreeformEvent(db, {
        name,
        startDate,
        endDate,
        createdById: currentUser.id,
        congregationId,
      })

      logger.info(`Created freeform event "${name}". User ID: ${currentUser.id}.`)
      session.flash('success', m.programs_new_created_success())
    }

    return redirect('/congregation/programs', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function NewEventPage({ loaderData }: Route.ComponentProps) {
  const { templates } = loaderData
  const [selectedValue, setSelectedValue] = useState<string>('')

  const isNoTemplate = selectedValue === NO_TEMPLATE
  const selectedTemplate = !isNoTemplate ? templates.find(t => t.id === Number(selectedValue)) : null
  const isRecurring = selectedTemplate?.weekDay != null
  const showForm = isNoTemplate || selectedTemplate != null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.programs_new_page_title()} subtitle={m.programs_new_page_subtitle()} />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">{m.programs_new_config_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="templateId">{m.programs_new_template_label()}</Label>
              {templates.length === 0 && (
                <p className="text-muted-foreground text-xs">{m.programs_new_no_templates_hint()}</p>
              )}
              <Select
                name={isNoTemplate ? undefined : 'templateId'}
                value={selectedValue}
                onValueChange={setSelectedValue}
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
            </div>

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
              </>
            )}

            {selectedTemplate && isRecurring && (
              <>
                <input type="hidden" name="mode" value="recurring" />
                <p className="text-muted-foreground text-sm">
                  {m.programs_new_recurring_hint({ day: dayLabel(selectedTemplate.weekDay ?? 0).toLowerCase() })}
                </p>
              </>
            )}

            {selectedTemplate && !isRecurring && (
              <>
                <input type="hidden" name="mode" value="single" />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="date">{m.programs_new_event_date_label()}</Label>
                  <Input id="date" name="date" type="date" min={new Date().toISOString().split('T')[0]} required />
                </div>
              </>
            )}

            {showForm && (
              <Button type="submit" className="w-fit">
                {isNoTemplate && m.programs_new_create_event()}
                {selectedTemplate && isRecurring && m.programs_new_generate_events()}
                {selectedTemplate && !isRecurring && m.programs_new_create_event()}
              </Button>
            )}
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
