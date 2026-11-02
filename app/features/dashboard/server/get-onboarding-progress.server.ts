import type { TransactionClient } from '~/shared/infra/db.server'

export interface OnboardingSteps {
  /** The viewer's login is linked to a member record of their own. */
  ownRecord: boolean
  publishers: boolean
  groups: boolean
  logins: boolean
  territories: boolean
}

export interface OnboardingProgress {
  steps: OnboardingSteps
  /**
   * Every congregation step is done. The personal `ownRecord` step is left out: an admin who is
   * not a member of the congregation (a circuit overseer) never completes it, and must not keep
   * the checklist open on a congregation that is otherwise set up.
   */
  complete: boolean
}

interface OnboardingViewer {
  accountId: number
  memberId: number | null
  congregationId: number
}

/**
 * Where the dashboard's "Premiers pas" checklist stands for one admin. The viewer's own member
 * and login are left out of the publisher and login counts: the founder creating their own
 * record, or being the only login, must not tick the steps about everyone else.
 */
export async function getOnboardingProgress(
  db: TransactionClient,
  viewer: OnboardingViewer,
): Promise<OnboardingProgress> {
  const { accountId, memberId, congregationId } = viewer

  const [publisherCount, groupCount, loginCount, territoryCount] = await Promise.all([
    db.member.count({
      where: { congregationId, isPublisher: true, leftAt: null, ...(memberId != null && { id: { not: memberId } }) },
    }),
    db.publisherGroup.count({ where: { congregationId } }),
    db.userAccount.count({ where: { congregationId, id: { not: accountId }, active: true, anonymizedAt: null } }),
    db.territory.count({ where: { congregationId } }),
  ])

  const steps: OnboardingSteps = {
    ownRecord: memberId != null,
    publishers: publisherCount > 0,
    groups: groupCount > 0,
    logins: loginCount > 0,
    territories: territoryCount > 0,
  }

  return {
    steps,
    complete: steps.publishers && steps.groups && steps.logins && steps.territories,
  }
}
