import { useState } from 'react'
import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import {
  createSingleEventFromTemplate,
  generateEventsFromTemplate,
} from '~/features/events/server/programme-generation.server'
import { getTemplates } from '~/features/events/server/programme-templates.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Nouvel évènement - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  if (!can(Role.ProgramManager)) throw redirect('/congregation/programs')

  return withScope(congregationId, async db => {
    const templates = await getTemplates(db, congregationId)
    return { templates }
  })
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser, can, session, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  if (!can(Role.ProgramManager)) throw redirect('/congregation/programs')

  const form = await request.formData()
  const templateId = Number(form.get('templateId'))
  const mode = String(form.get('mode'))

  return withScope(congregationId, async db => {
    if (mode === 'recurring') {
      const events = await generateEventsFromTemplate(db, templateId, 2, currentUser.id, congregationId)
      logger.info(`Generated ${events.length} events from template ${templateId}. User ID: ${currentUser.id}.`)

      session.flash(
        'success',
        events.length > 0
          ? `${events.length} évènement(s) généré(s) pour les 2 prochains mois.`
          : 'Aucun nouvel évènement à générer. Les évènements existent déjà pour cette période.',
      )
    }

    if (mode === 'single') {
      const date = new Date(String(form.get('date')))
      const event = await createSingleEventFromTemplate(db, templateId, date, currentUser.id, congregationId)
      logger.info(`Created single event from template ${templateId}. User ID: ${currentUser.id}.`)

      if (event) {
        session.flash('success', 'Évènement créé avec succès.')
      } else {
        session.flash('error', 'Un évènement existe déjà pour ce modèle à cette date.')
      }
    }

    return redirect('/congregation/programs', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function NewEventPage({ loaderData }: Route.ComponentProps) {
  const { templates } = loaderData
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const selectedTemplate = templates.find(t => t.id === Number(selectedTemplateId))
  const isRecurring = selectedTemplate?.isRecurring ?? false

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nouvel évènement"
        subtitle="Créez un ou plusieurs évènements à partir d'un modèle de programme."
      />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Choisir un modèle</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="templateId">Modèle de programme</Label>
              <Select name="templateId" value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un modèle" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.name}
                      {template.isRecurring && template.weekDay != null ? ` (${dayLabel(template.weekDay)})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTemplate && isRecurring && (
              <>
                <input type="hidden" name="mode" value="recurring" />
                <p className="text-muted-foreground text-sm">
                  Les évènements pour les 2 prochains mois seront générés automatiquement chaque{' '}
                  <strong>{dayLabel(selectedTemplate.weekDay ?? 0).toLowerCase()}</strong>. Les évènements existants ne
                  seront pas dupliqués.
                </p>
              </>
            )}

            {selectedTemplate && !isRecurring && (
              <>
                <input type="hidden" name="mode" value="single" />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="date">Date de l'évènement</Label>
                  <Input id="date" name="date" type="date" min={new Date().toISOString().split('T')[0]} required />
                </div>
              </>
            )}

            {selectedTemplate && (
              <Button type="submit" className="w-fit">
                {isRecurring ? 'Générer les évènements' : "Créer l'évènement"}
              </Button>
            )}
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

function dayLabel(weekDay: number): string {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
  return days[weekDay] ?? ''
}
