import { hash } from '~/shared/auth/crypto.server'
import { unscopedDb as db } from '~/shared/infra/db.server'

export async function resetAccountPassword(userId: number, password: string) {
  const account = await db.userAccount.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true },
  })

  const hashedPassword = await hash(password)

  // The password change and the end of the account's reset links commit together: an older link
  // must never be able to reset the new password, even if the request fails halfway.
  await db.$transaction(async tx => {
    // Completing the reset proves the email recipient controls the inbox. If the
    // account was created with emailVerifiedAt = null (e.g. `link-account-to-member`
    // by an elder), stamp it now — otherwise leave the original verification date.
    await tx.userAccount.update({
      where: {
        id: userId,
      },
      data: {
        password: hashedPassword,
        // Revoke every session issued before this reset — bumping the epoch orphans
        // their cookies on the next request (see verifySession).
        sessionEpoch: { increment: 1 },
        ...(account?.emailVerifiedAt == null ? { emailVerifiedAt: new Date() } : {}),
      },
    })
    await tx.passwordResetToken.deleteMany({ where: { userId } })
  })
}
