/** A holder of a schedule's responsible role, as read (listScheduleResponsibles). */
interface Holder {
  memberId: number | null
  accountId: number | null
  firstname: string | null
  lastname: string | null
  seat: 'leader' | 'deputy' | 'member'
}

/** What the event page shows of a schedule's responsible: names only, « vous » worked out here (D37). */
export interface PageResponsible {
  role: { key: string; name: string | null }
  holders: { firstname: string | null; lastname: string | null; seat: Holder['seat']; you: boolean }[]
  /** The reader holds the role, named among the holders or not: what lets them fill and publish it. */
  youHoldIt: boolean
}

const SHOWN_HOLDERS = 4

/**
 * A schedule's responsible as its section names it (D37): the role, then its titulaire and its adjoints; the other
 * holders only when there is neither, four at most. The reader is « vous » when named, and the page says they hold
 * the role even when they are not among those named.
 */
export function responsibleForPage(
  roleId: number,
  responsible: { role: PageResponsible['role']; holders: readonly Holder[] },
  viewer: { accountId: number; memberId: number | null; roleIds: readonly number[] },
): PageResponsible {
  const seated = responsible.holders.filter(holder => holder.seat !== 'member')
  const shown = (seated.length > 0 ? seated : responsible.holders).slice(0, SHOWN_HOLDERS)
  const isViewer = (holder: Holder) =>
    (holder.memberId != null && holder.memberId === viewer.memberId) || holder.accountId === viewer.accountId
  return {
    role: responsible.role,
    holders: shown.map(holder => ({
      firstname: holder.firstname,
      lastname: holder.lastname,
      seat: holder.seat,
      you: isViewer(holder),
    })),
    youHoldIt: viewer.roleIds.includes(roleId),
  }
}
