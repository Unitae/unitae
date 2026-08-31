// A month the monthly-auxiliary create form can target, paired with the goal to seed for it.
// Built by the publisher edit-page loader and consumed by the enrolment UI.
export interface EnrolmentMonthOption {
  month: number // 0-indexed calendar month, matching Date.getMonth()
  year: number // Gregorian calendar year
  // The congregation's configured auxiliary rate, in hours, for *this* month's service year. The
  // two selectable months can straddle the September boundary and resolve to different rates, so
  // the rate travels with the month rather than being resolved once for "now".
  auxiliaryGoal: number
}
