import { createCookieSessionStorage, redirect, type Session } from 'react-router'
import { buildLoginRedirectUrl } from '~/features/authentication/server/post-login-redirect.server'
import { sanitizeAccount } from '~/shared/auth/sanitize-account.server'
import { SESSION_MAX_AGE_SECONDS_DEV, SESSION_MAX_AGE_SECONDS_PROD } from '~/shared/constants/limits'
import { resolveCongregation, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

type SessionData = {
  userId: string
  // Session epoch stamped when the session is established. Compared against the account's
  // current sessionEpoch on every request; a mismatch means the account's sessions were
  // revoked (password change/reset or admin invalidation) and this cookie is stale.
  sessionEpoch: string
  // Set after a correct password when the account has 2FA enabled, but before the
  // TOTP challenge is passed. The user is NOT authenticated while only this is set —
  // `userId` is written only once the challenge succeeds.
  pending2faUserId: string
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

// Establish an authenticated session: stamp the userId together with the account's current
// session epoch so verifySession accepts it. Use this everywhere a session is (re)issued
// instead of setting `userId` alone — otherwise the cookie carries no epoch (read as 0) and
// is rejected as soon as the account's epoch has ever been bumped.
export async function establishAuthenticatedSession(
  session: Session<SessionData, SessionFlashData>,
  userId: number,
): Promise<void> {
  const account = await unscopedDb.userAccount.findUnique({
    where: { id: userId },
    select: { sessionEpoch: true },
  })

  // Callers pass a freshly-loaded, known-good id, so a miss here means the account vanished
  // mid-request (a race). Stamp epoch 0 and let the next verifySession fail the existence
  // check — but surface the anomaly rather than swallowing it.
  if (account == null) {
    logger.warn(`establishAuthenticatedSession: no account found for userId ${userId}`)
  }

  session.set('userId', String(userId))
  session.set('sessionEpoch', String(account?.sessionEpoch ?? 0))
}

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

    // Reject cookies issued before the account's sessions were revoked. A missing cookie
    // epoch coerces to 0 so sessions predating this feature stay valid until the first bump.
    if (Number(session.get('sessionEpoch') ?? 0) !== user.sessionEpoch) {
      return redirectToLogin(session, { redirectTo })
    }

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
