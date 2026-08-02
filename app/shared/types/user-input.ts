import type { Member } from '~/database/generated/client'

// `hasLogin` tells the edit view whether the Member has a linked UserAccount (to
// show link vs. unlink); `email` is the Member's contact email — the login email
// lives on UserAccount, not here.
export type UserInput = Omit<Member, 'congregationId'> & { hasLogin: boolean }
