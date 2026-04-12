import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
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
  return [{ title: 'Nouveau modèle - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can } = await authenticateAndAuthorize(request, [Role.Admin])
  if (!can(Role.Admin)) throw redirect('/')
  return {}
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser, can, session, congregationId } = await authenticateAndAuthorize(request, [Role.Admin])
  if (!can(Role.Admin)) throw redirect('/')

  const form = await request.formData()
  const name = String(form.get('name') ?? '').trim()
  const key = String(form.get('key') ?? '').trim()
  const rawWeekDay = form.get('weekDay')
  const weekDay = rawWeekDay && rawWeekDay !== 'none' ? Number(rawWeekDay) : null

  if (!name || !key) {
    session.flash('error', 'Le nom et la clé sont requis.')
    return redirect('/settings/congregation/templates/new', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  return withScope(congregationId, async db => {
    const existing = await db.programmeTemplate.findFirst({ where: { key, congregationId } })
    if (existing) {
      session.flash('error', 'Un modèle avec cette clé existe déjà.')
      return redirect('/settings/congregation/templates/new', {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }

    const template = await db.programmeTemplate.create({
      data: {
        name,
        key,
        weekDay,
        isRecurring: weekDay != null,
        congregationId,
      },
    })

    logger.info(`Created template "${name}" (${key}). User ID: ${currentUser.id}.`)
    session.flash('success', `Modèle « ${name} » créé.`)

    return redirect(`/settings/congregation/templates/${template.id}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function NewTemplatePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nouveau modèle" subtitle="Créez un nouveau modèle de programme pour votre assemblée." />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Informations</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" placeholder="Ex : Réunion de semaine" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="key">Clé unique</Label>
              <Input id="key" name="key" placeholder="Ex : midweek-meeting" required />
              <p className="text-muted-foreground text-xs">
                Identifiant unique pour ce modèle (en minuscules, sans espaces).
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="weekDay">Jour de la semaine</Label>
              <Select name="weekDay" defaultValue="none">
                <SelectTrigger>
                  <SelectValue placeholder="Aucun (évènement ponctuel)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun (évènement ponctuel)</SelectItem>
                  <SelectItem value="0">Dimanche</SelectItem>
                  <SelectItem value="1">Lundi</SelectItem>
                  <SelectItem value="2">Mardi</SelectItem>
                  <SelectItem value="3">Mercredi</SelectItem>
                  <SelectItem value="4">Jeudi</SelectItem>
                  <SelectItem value="5">Vendredi</SelectItem>
                  <SelectItem value="6">Samedi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-fit">
              Créer le modèle
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
