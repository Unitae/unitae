import { type RouterContext, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
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
  // Why the submitted form cannot be applied (e.g. a departure dated in the future): flashed as the
  // error instead of running the service.
  refusal?: string | null
}

/**
 * Shared shell for the four Member lifecycle action routes
 * (mark-as-left, mark-as-returned, make-publisher, make-student). All share:
 *
 *  1. Gate on `Permission.CanManagePublisherLifecycle`.
 *  2. Parse `:publisherId` as a `MemberId` brand.
 *  3. Self-X guard — the actor can't change their own publisher status.
 *  4. Look up the Member to compose a "{firstname lastname}" flash message.
 *  5. Run the service, catching `NotFoundError` to flash instead of 500.
 *  6. Redirect to the previous page (or the publisher view).
 */
export function runLifecycleAction<T>(config: LifecycleActionConfig<T>): Promise<Response> {
  const { request, params, context, action, refusal } = config
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.CanManagePublisherLifecycle)) {
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
    const [kind, message] = await outcome(member != null, refusal, config, name, () =>
      action(db, memberId, currentUser.congregationId, currentUser.id),
    )
    session.flash(kind, message)

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? `/publishers/${memberId}/view`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

/** What to flash: the member is missing, the form was refused, or the service ran and did, or did not, get there. */
async function outcome<T>(
  found: boolean,
  refusal: string | null | undefined,
  config: LifecycleActionConfig<T>,
  name: string,
  run: () => Promise<T>,
): Promise<['success' | 'error', string]> {
  if (!found) return ['error', config.errorMessage(name)]
  if (refusal) return ['error', refusal]
  return (await runService(run, config.assertSuccess))
    ? ['success', config.successMessage(name)]
    : ['error', config.errorMessage(name)]
}

/** Runs the lifecycle service: whether it produced the state it was asked for. A missing member reads as a failure. */
async function runService<T>(run: () => Promise<T>, assertSuccess?: (result: T) => boolean): Promise<boolean> {
  try {
    const result = await run()
    return assertSuccess == null || assertSuccess(result)
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error
    return false
  }
}
