import type { ReactNode } from 'react'
import { createPasswordResetToken } from '~/features/authentication/server/invalidate-user-password.server'
import { sendResetUserPasswordEmail } from '~/features/authentication/server/send-reset-user-password-email.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { LimitService } from '~/shared/domain/limits.server'

export interface CreateUserParams {
  firstname: string
  lastname: string
  email: string
  congregationId: number
}

export interface CreateUserResult {
  userId: number
  emailSent: boolean
}

export async function createUser(
  db: TransactionClient,
  congregation: CongregationInfo,
  actorId: number,
  params: CreateUserParams,
  renderEmail: (userId: number, token: string) => ReactNode,
): Promise<CreateUserResult> {
  const existingUser = await db.user.findUnique({
    where: { email: params.email },
  })

  if (existingUser != null) {
    throw new ConflictError('User already exists')
  }

  const limits = new LimitService(db, congregation)
  await limits.errorIfWouldGoOverLimit('users')

  const user = await db.user.create({
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

  const token = await createPasswordResetToken(user.id)
  const emailSent = await sendResetUserPasswordEmail(user.id, renderEmail(user.id, token))

  audit({
    action: AuditAction.UserCreated,
    congregationId: params.congregationId,
    actorId,
    entityType: 'User',
    entityId: user.id,
  })

  return { userId: user.id, emailSent }
}

// Re-export for backwards compatibility — callers can catch ConflictError directly
export { ConflictError as UserAlreadyExistsError } from '~/shared/errors/app-error.server'
