import { unscopedDb as db } from '~/shared/infra/db.server'

export async function needSetupProcess() {
  const users = await db.userAccount.count()

  return users === 0
}
