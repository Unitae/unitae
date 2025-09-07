import { redirect, redirectDocument } from 'react-router'

import { destroySession, getSession } from '~/features/authentication/server/session.server'

import type { Route } from './+types/logout'

export function loader({ request }: Route.LoaderArgs) {
  throw redirect('/')
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))

  return redirectDocument('/', {
    headers: {
      'Set-Cookie': await destroySession(session),
    },
  })
}
