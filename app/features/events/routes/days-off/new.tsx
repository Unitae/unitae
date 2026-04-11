import { useState } from 'react'
import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { createDayOff } from '~/features/events/server/days-off.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Ajouter une absence - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, session } = await authenticateAndAuthorize(request)
  logger.info(`Loading personal Days Off form. User ID: ${currentUser.id}.`)

  return {
    user: currentUser,
    error: session.get('error'),
  }
}

export default function DaysOffPage() {
  const [startDate, setStartDate] = useState('')

  const minimumEndDate = new Date(startDate.length > 0 ? startDate : new Date().toISOString().split('T')[0])
  minimumEndDate.setDate(minimumEndDate.getDate() + 1)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ajouter une absence"
        subtitle="Ajoutez une absence pour que les frères en charge des programmes puissent en tenir compte."
      />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="start_date">Date de début</Label>
              <Input
                id="start_date"
                type="date"
                name="start_date"
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setStartDate(e.target.value)}
                value={startDate}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="end_date">Date de fin</Label>
              <Input
                id="end_date"
                type="date"
                name="end_date"
                min={minimumEndDate.toISOString().split('T')[0]}
                required
              />
            </div>
            <Button type="submit" className="w-fit">
              Enregistrer
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser, session, congregationId } = await authenticateAndAuthorize(request)
  const formData = await request.formData()
  const startDate = new Date(String(formData.get('start_date')))
  const endDate = new Date(String(formData.get('end_date')))

  logger.info(`Creating new days off. User ID: ${currentUser.id}.`)

  return withScope(congregationId, async db => {
    const event = await createDayOff(db, currentUser.id, startDate, endDate, congregationId)
    if (event == null) {
      session.flash('error', `Impossible d'ajouter cette absence. Les dates sont invalides.`)
      logger.info(`Failed to creating new days off. User ID: ${currentUser.id}.`)

      return redirect('/me/days-off', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    session.flash('success', 'Absence ajoutée avec succès.')
    logger.info(`Successfuly created new days off. User ID: ${currentUser.id}.`)

    return redirect('/me/days-off', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
