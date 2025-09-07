import type { User } from '~/database/generated/client'

export type UserInput = Omit<User, 'password' | 'email'> & Partial<Pick<User, 'email'>>
