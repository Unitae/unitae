import type { Member } from '~/database/generated/client'

// Form-shaped subset of Member used by publisher form components. `email` is
// the Member's contact email (part of Member). `hasLogin` tells the edit view
// whether the Member has a linked UserAccount (to show link vs. unlink) — the
// login email itself lives on UserAccount, not here.
export type UserInput = Omit<Member, 'congregationId'> & { hasLogin?: boolean }
