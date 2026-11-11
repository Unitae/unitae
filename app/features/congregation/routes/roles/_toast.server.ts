import { data } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'

/**
 * After a change made through a fetcher: `{ ok: true }` plus whatever the page needs next (the id of a role just
 * created, to open its panel), and the layout shows `message` as a toast.
 */
export async function okWithToast<T extends Record<string, unknown>>(request: Request, message: string, extra?: T) {
  const session = await getSession(request.headers.get('Cookie'))
  session.flash('success', message)
  return data(
    { ok: true as const, ...(extra ?? ({} as T)) },
    { headers: { 'Set-Cookie': await commitSession(session) } },
  )
}
