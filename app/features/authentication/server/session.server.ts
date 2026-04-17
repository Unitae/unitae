import { createCookieSessionStorage, redirect } from 'react-router'

import { resolveCongregation, resolveCongregationFromRequest } from '~/shared/libs/congregation.server'
import { unscopedDb } from '~/shared/libs/db.server'

import { sanitizeUser } from './sanitize-user.server'

type SessionData = {
  userId: string
}

type SessionFlashData = {
  error: string
  success: string
}

const { getSession, commitSession, destroySession } = createCookieSessionStorage<SessionData, SessionFlashData>({
  cookie: {
    name: '__session',

    // all of these are optional
    ...(process.env.NODE_ENV === 'production' ? { domain: process.env.COOKIE_DOMAIN } : {}),
    httpOnly: true,
    maxAge: process.env.NODE_ENV === 'production' ? 60 * 60 : 60 * 60 * 8,
    path: '/',
    sameSite: 'lax',
    // biome-ignore lint/style/noNonNullAssertion: validated at startup by env.server.ts
    secrets: [process.env.SESSION_SECRET!],
    secure: process.env.NODE_ENV === 'production',
  },
})

export { commitSession, destroySession, getSession }

export async function verifySession(request: Request) {
  const session = await getSession(request.headers.get('Cookie'))
  const userId = Number(session.get('userId'))
  if (Number.isNaN(userId)) {
    throw redirect('/login', {
      headers: {
        'Set-Cookie': await destroySession(session),
      },
    })
  }

  // Use unscopedDb for user lookup — we don't have congregation context yet
  const user = await unscopedDb.user.findUnique({
    where: {
      id: userId,
    },
    include: {
      responsibleFor: true,
      deputyFor: true,
    },
  })

  if (user == null || !user.active) {
    throw redirect('/login', {
      headers: {
        'Set-Cookie': await destroySession(session),
      },
    })
  }

  // In multi-tenant mode, verify that the subdomain matches the user's congregation
  const urlCongregation = await resolveCongregationFromRequest(request)
  if (urlCongregation && urlCongregation.id !== user.congregationId) {
    throw redirect('/login', {
      headers: {
        'Set-Cookie': await destroySession(session),
      },
    })
  }

  const congregation = await resolveCongregation(user.congregationId)

  if (congregation.suspendedAt) {
    const params = new URLSearchParams()
    if (congregation.suspendedReason) {
      params.set('reason', congregation.suspendedReason)
    }
    const query = params.toString()
    throw redirect(`/suspended${query ? `?${query}` : ''}`)
  }

  if (congregation.trialEndsAt && congregation.trialEndsAt < new Date()) {
    throw redirect('/trial-expired')
  }

  if (!user.emailVerifiedAt) {
    throw redirect('/verify-email')
  }

  return {
    currentUser: sanitizeUser(user),
    congregation,
    session,
  }
}
