import type { Member } from '~/database/generated/client'

// Form-shaped subset of Member used by publisher form components. Email is
// optional because Members no longer carry one (it lives on UserAccount when
// the Member has a login).
export type UserInput = Omit<Member, 'congregationId'> & { email?: string | null }
