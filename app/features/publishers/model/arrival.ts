/** How long after arriving in the congregation the group page flags a welcome visit. */
export const NEW_ARRIVAL_MONTHS = 3

/** A member away this long before coming back is welcomed like a new arrival. */
const RETURN_AS_ARRIVAL_MONTHS = 12

/**
 * The arrival date to record when a member who had left comes back: the day they returned on, when
 * they had been away for more than a year; otherwise none, and their arrival date stays as it was.
 * Like every date-only field it is a calendar day at UTC midnight: `returnedOn` is read by its UTC
 * date, so pass the congregation's day at UTC midnight, not the moment of the return.
 */
export function arrivalOnReturn(leftAt: Date | null, returnedOn: Date): Date | null {
  if (leftAt == null) return null
  const day = new Date(Date.UTC(returnedOn.getUTCFullYear(), returnedOn.getUTCMonth(), returnedOn.getUTCDate()))
  const aYearLater = new Date(
    Date.UTC(leftAt.getUTCFullYear(), leftAt.getUTCMonth() + RETURN_AS_ARRIVAL_MONTHS, leftAt.getUTCDate()),
  )
  return day > aYearLater ? day : null
}
