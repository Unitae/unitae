import { useState } from 'react'
import { Form, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { createDayOff } from '~/features/events/server/days-off.server'
import logger from '~/shared/libs/logger.server'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Ajouter une absence - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, session } = await verifySession(request)

  logger.info(`Loading personal Days Off form. User ID: ${currentUser.id}.`)

  return {
    user: currentUser,
    error: session.get('error'),
  }
}

export default function DaysOffPage({ loaderData }: Route.ComponentProps) {
  const [startDate, setStartDate] = useState('')

  const minimumEndDate = new Date(startDate.length > 0 ? startDate : new Date().toISOString().split('T')[0])
  minimumEndDate.setDate(minimumEndDate.getDate() + 1)

  return (
    <div className="flex h-screen flex-col">
      <HeroHeader
        title="Ajouter une absence"
        subtitle="Ajoutez une absence pour que les frères en charge des programmes puissent en tenir compte."
      />

      <div className="my-4">
        <Form method="post" className="flex flex-col gap-3">
          <label className="flex flex-col">
            Date de début
            <input
              type="date"
              name="start_date"
              className="rounded-md border border-gray-300 p-2 focus:border-teal-500 focus:outline-none"
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setStartDate(e.target.value)}
              value={startDate}
              required
            />
          </label>
          <label className="flex flex-col">
            Date de fin
            <input
              type="date"
              name="end_date"
              className="rounded-md border border-gray-300 p-2 focus:border-teal-500 focus:outline-none"
              min={minimumEndDate.toISOString().split('T')[0]}
              required
            />
          </label>
          <button type="submit" className="mt-3 rounded-lg bg-teal-600 p-2 font-semibold text-white hover:bg-teal-900">
            Enregistrer
          </button>
        </Form>
      </div>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser, session } = await verifySession(request)
  const formData = await request.formData()
  const startDate = new Date(String(formData.get('start_date')))
  const endDate = new Date(String(formData.get('end_date')))

  logger.info(`Creating new days off. User ID: ${currentUser.id}.`)

  const event = createDayOff(currentUser.id, startDate, endDate)
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
}
