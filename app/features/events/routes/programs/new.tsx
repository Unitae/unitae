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

const NO_TEMPLATE = 'none'

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
  const mode = String(form.get('mode'))

  return withScope(congregationId, async db => {
    if (mode === 'recurring') {
      const templateId = Number(form.get('templateId'))
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
      const templateId = Number(form.get('templateId'))
      const date = new Date(String(form.get('date')))
      const event = await createSingleEventFromTemplate(db, templateId, date, currentUser.id, congregationId)
      logger.info(`Created single event from template ${templateId}. User ID: ${currentUser.id}.`)

      if (event) {
        session.flash('success', 'Évènement créé avec succès.')
      } else {
        session.flash('error', 'Un évènement existe déjà pour ce modèle à cette date.')
      }
    }

    if (mode === 'freeform') {
      const name = String(form.get('name') ?? '').trim()
      const date = new Date(String(form.get('date')))

      if (!name) {
        session.flash('error', "Le nom de l'évènement est requis.")
        return redirect('/congregation/programs/new', {
          headers: { 'Set-Cookie': await commitSession(session) },
        })
      }

      const startDate = new Date(date)
      startDate.setHours(19, 0, 0, 0)
      const endDate = new Date(date)
      endDate.setHours(21, 0, 0, 0)

      await db.event.create({
        data: {
          name,
          startDate,
          endDate,
          createdById: currentUser.id,
          congregationId,
        },
      })

      logger.info(`Created freeform event "${name}". User ID: ${currentUser.id}.`)
      session.flash('success', 'Évènement créé avec succès.')
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
  const isRecurring = selectedTemplate?.isRecurring ?? false
  const showForm = isNoTemplate || selectedTemplate != null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nouvel évènement"
        subtitle="Créez un évènement libre ou générez-en à partir d'un modèle de programme."
      />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="templateId">Modèle de programme (facultatif)</Label>
              <Select
                name={isNoTemplate ? undefined : 'templateId'}
                value={selectedValue}
                onValueChange={setSelectedValue}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un modèle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>Aucun modèle (évènement libre)</SelectItem>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.name}
                      {template.isRecurring && template.weekDay != null ? ` (${dayLabel(template.weekDay)})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isNoTemplate && (
              <>
                <input type="hidden" name="mode" value="freeform" />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Nom de l'évènement</Label>
                  <Input id="name" name="name" placeholder="Ex : Assemblée spéciale" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" name="date" type="date" min={new Date().toISOString().split('T')[0]} required />
                </div>
              </>
            )}

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

            {showForm && (
              <Button type="submit" className="w-fit">
                {isNoTemplate && "Créer l'évènement"}
                {selectedTemplate && isRecurring && 'Générer les évènements'}
                {selectedTemplate && !isRecurring && "Créer l'évènement"}
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
