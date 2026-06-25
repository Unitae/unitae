import { type RouterContext, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

interface RouteContext {
  get<T>(context: RouterContext<T>): T
}

interface LifecycleActionConfig<T> {
  request: Request
  params: { publisherId?: string }
  context: RouteContext
  // Service that performs the actual mutation. Throws NotFoundError if the
  // member doesn't exist in the congregation scope.
  action: (db: TransactionClient, memberId: MemberId, congregationId: number, actorId: number) => Promise<T>
  // Flash message templates. `{name}` slot in messages is filled from
  // the Member's firstname + lastname.
  successMessage: (name: string) => string
  errorMessage: (name: string) => string
  // Optional post-condition: if returned false, the service ran but didn't
  // produce the expected state (e.g. togglePublisherStatus didn't flip the
  // flag). Surfaces an error flash instead of success.
  assertSuccess?: (result: T) => boolean
}

/**
 * Shared shell for the four Member lifecycle action routes
 * (mark-as-left, mark-as-returned, make-publisher, make-student). All share:
 *
 *  1. Gate on `Permission.PublisherManager`.
 *  2. Parse `:publisherId` as a `MemberId` brand.
 *  3. Self-X guard — the actor can't change their own publisher status.
 *  4. Look up the Member to compose a "{firstname lastname}" flash message.
 *  5. Run the service, catching `NotFoundError` to flash instead of 500.
 *  6. Redirect to the previous page (or the publisher view).
 */
export function runLifecycleAction<T>(config: LifecycleActionConfig<T>): Promise<Response> {
  const { request, params, context, action, successMessage, errorMessage, assertSuccess } = config
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.PublisherManager)) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const memberId = requireParamId<MemberId>(params.publisherId, '/publishers')

    if (currentUser.member?.id === memberId) {
      session.flash('error', m.publishers_view_lifecycle_self_error())
      return redirect(`/publishers/${memberId}/view`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }

    const member = await db.member.findFirst({
      where: { id: memberId, congregationId: currentUser.congregationId },
      select: { firstname: true, lastname: true },
    })
    const name = member ? `${member.firstname} ${member.lastname}` : ''

    if (!member) {
      session.flash('error', errorMessage(name))
    } else {
      try {
        const result = await action(db, memberId, currentUser.congregationId, currentUser.id)
        if (assertSuccess == null || assertSuccess(result)) {
          session.flash('success', successMessage(name))
        } else {
          session.flash('error', errorMessage(name))
        }
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error
        session.flash('error', errorMessage(name))
      }
    }

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? `/publishers/${memberId}/view`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
