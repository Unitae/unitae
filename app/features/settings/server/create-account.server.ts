import type { ReactNode } from 'react'
// Intentional cross-feature import: user creation relies on authentication for password reset flow
import { createPasswordResetToken, sendResetAccountPasswordEmail } from '~/features/authentication/index.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import { LimitService } from '~/shared/domain/limits.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface CreateAccountParams {
  firstname: string
  lastname: string
  email: string
  congregationId: number
}

export interface CreateAccountResult {
  userId: number
  emailSent: boolean
}

/**
 * Create a UserAccount-only login (admin / circuit overseer / external user).
 *
 * No Member is created — the admin path is for accounts that don't belong to
 * the congregation as a publisher. To attach a Member after the fact, call
 * `linkMemberToAccount`. Password is set to a placeholder and the caller is
 * sent a password-reset email.
 */
export async function createAccount(
  db: TransactionClient,
  congregation: CongregationInfo,
  actorId: number,
  params: CreateAccountParams,
  renderEmail: (userId: number, token: string) => ReactNode,
): Promise<CreateAccountResult> {
  const existingUser = await db.userAccount.findUnique({
    where: { email: params.email },
  })

  if (existingUser != null) {
    throw new ConflictError('User already exists')
  }

  const limits = new LimitService(db, congregation)
  await limits.errorIfWouldGoOverLimit('users')

  const user = await db.userAccount.create({
    data: {
      firstname: params.firstname,
      lastname: params.lastname,
      email: params.email.toLocaleLowerCase(),
      active: true,
      password: 'password',
      emailVerifiedAt: new Date(),
      congregationId: params.congregationId,
    },
  })

  const token = await createPasswordResetToken(user.id, db)
  const emailSent = await sendResetAccountPasswordEmail(user.id, renderEmail(user.id, token))

  audit({
    action: AuditAction.UserCreated,
    congregationId: params.congregationId,
    actorId,
    entityType: 'UserAccount',
    entityId: user.id,
  })

  return { userId: user.id, emailSent }
}

// Re-export for backwards compatibility — callers can catch ConflictError directly
export { ConflictError as UserAlreadyExistsError } from '~/shared/errors/app-error.server'
