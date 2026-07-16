import { createCookieSessionStorage, redirect, type Session } from 'react-router'
import { buildLoginRedirectUrl } from '~/features/authentication/server/post-login-redirect.server'
import { sanitizeAccount } from '~/shared/auth/sanitize-account.server'
import { SESSION_MAX_AGE_SECONDS_DEV, SESSION_MAX_AGE_SECONDS_PROD } from '~/shared/constants/limits'
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
    ...(process.env.NODE_ENV === 'production' ? { domain: process.env.UNITAE_COOKIE_DOMAIN } : {}),
    httpOnly: true,
    maxAge: process.env.NODE_ENV === 'production' ? SESSION_MAX_AGE_SECONDS_PROD : SESSION_MAX_AGE_SECONDS_DEV,
    path: '/',
    sameSite: 'lax',
    // biome-ignore lint/style/noNonNullAssertion: validated at startup by env.server.ts
    secrets: [process.env.UNITAE_SESSION_SECRET!],
    secure: process.env.NODE_ENV === 'production',
  },
})

export { commitSession, destroySession, getSession }

async function redirectToLogin(
  session: Session<SessionData, SessionFlashData>,
  options: { redirectTo?: string } = {},
): Promise<never> {
  throw redirect(buildLoginRedirectUrl(options.redirectTo ?? '/'), {
    headers: {
      'Set-Cookie': await destroySession(session),
    },
  })
}

function extractRedirectTo(request: Request): string {
  try {
    const url = new URL(request.url)
    return `${url.pathname}${url.search}`
  } catch {
    logger.warn(`verifySession: unable to parse request.url (${request.url})`)
    return '/'
  }
}

async function findUserFromSession(session: Session<SessionData, SessionFlashData>, redirectTo: string) {
  const rawUserId = session.get('userId')
  const userId = Number(rawUserId)
  if (!rawUserId || Number.isNaN(userId) || userId <= 0) {
    return redirectToLogin(session, { redirectTo })
  }

  try {
    const user = await unscopedDb.userAccount.findUnique({
      where: { id: userId },
      include: { member: { include: { responsibleFor: true, deputyFor: true } } },
    })

    if (user == null || !user.active) return redirectToLogin(session, { redirectTo })
    return user
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as Error & { code: string }).code === 'P2007') {
      logger.warn(`Session verification failed: adapter sent invalid value for userId ${userId} (P2007)`)
      return redirectToLogin(session, { redirectTo })
    }
    throw error
  }
}

export async function verifySession(request: Request) {
  const session = await getSession(request.headers.get('Cookie'))
  const redirectTo = extractRedirectTo(request)
  const user = await findUserFromSession(session, redirectTo)

  const urlCongregation = await resolveCongregationFromRequest(request)
  if (urlCongregation && urlCongregation.id !== user.congregationId) {
    // Don't preserve the URL: it belongs to a different congregation and must not survive re-login.
    return redirectToLogin(session)
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
    currentUser: sanitizeAccount(user),
    congregation,
    session,
  }
}
