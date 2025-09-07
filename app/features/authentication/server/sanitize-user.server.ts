import type { User } from '~/database/generated/client'

export type SanitizedUser = ReturnType<typeof sanitizeUser>

export function sanitizeUser<T extends User>(user: T): Omit<T, 'password'> {
  const { password, ...sanitizedUser } = user
  return sanitizedUser
}
