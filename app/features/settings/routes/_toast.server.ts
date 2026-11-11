import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'

type Kind = 'success' | 'error'

async function flashed(request: Request, kind: Kind, message: string) {
  const session = await getSession(request.headers.get('Cookie'))
  session.flash(kind, message)
  return { 'Set-Cookie': await commitSession(session) }
}

/** After a page form's save: back to `to`, where the layout shows `message` as a toast. */
export async function redirectWithToast(request: Request, to: string, message: string, kind: Kind = 'success') {
  return redirect(to, { headers: await flashed(request, kind, message) })
}

/** After a dialog's or a panel's save through a fetcher: `{ ok: true }` closes it, and the layout shows `message`. */
export async function okWithToast(request: Request, message: string) {
  return data({ ok: true as const }, { headers: await flashed(request, 'success', message) })
}
