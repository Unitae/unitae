import { createCookieSessionStorage, redirect } from 'react-router'
import { Prisma } from '~/database/generated/client'
import { sanitizeUser } from '~/shared/auth/sanitize-user.server'
import { resolveCongregation, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

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
  const rawUserId = session.get('userId')
  const userId = Number(rawUserId)
  if (!rawUserId || Number.isNaN(userId) || userId <= 0) {
    throw redirect('/login', {
      headers: {
        'Set-Cookie': await destroySession(session),
      },
    })
  }

  // Use unscopedDb for user lookup — we don't have congregation context yet
  let user
  try {
    user = await unscopedDb.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        responsibleFor: true,
        deputyFor: true,
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2007') {
      logger.warn(`Session verification failed: adapter sent invalid value for userId ${userId} (P2007)`)
      throw redirect('/login', {
        headers: {
          'Set-Cookie': await destroySession(session),
        },
      })
    }
    throw error
  }

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
    throw redirect('/suspended')
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
