/** How long after arriving in the congregation the group page flags a welcome visit. */
export const NEW_ARRIVAL_MONTHS = 3

/** A member away this long before coming back is welcomed like a new arrival. */
const RETURN_AS_ARRIVAL_MONTHS = 12

/**
 * The arrival date to record when a member who had left comes back: the return date itself
 * (`now`), when they had been away for more than a year; otherwise none, and their arrival date
 * stays as it was.
 */
export function arrivalOnReturn(leftAt: Date | null, now: Date): Date | null {
  if (leftAt == null) return null
  const aYearLater = new Date(leftAt.getFullYear(), leftAt.getMonth() + RETURN_AS_ARRIVAL_MONTHS, leftAt.getDate())
  return now > aYearLater ? now : null
}
