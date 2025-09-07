export function getBeginingDateOfTheocraticYear(theocraticYear?: number) {
  const today = theocraticYear != null ? new Date(theocraticYear, 10, 1) : new Date()
  const startOfCurrentYear =
    today.getMonth() > 7 ? new Date(today.getFullYear(), 8, 1) : new Date(today.getFullYear() - 1, 8, 1)

  return startOfCurrentYear
}
export function getEndDateOfTheocraticYear(theocraticYear?: number) {
  const today = theocraticYear != null ? new Date(theocraticYear, 10, 1) : new Date()
  const startOfCurrentYear =
    today.getMonth() > 7 ? new Date(today.getFullYear() + 1, 7, 31) : new Date(today.getFullYear(), 7, 31)

  return startOfCurrentYear
}

export function getCurrentTheocraticYear() {
  const startOfCurrentYear = getBeginingDateOfTheocraticYear()
  return startOfCurrentYear.getFullYear()
}

export function getNextTheocraticYear() {
  const startOfCurrentYear = getBeginingDateOfTheocraticYear()
  return startOfCurrentYear.getFullYear() + 1
}

export function getPreviousTheocraticYear() {
  const startOfCurrentYear = getBeginingDateOfTheocraticYear()
  return startOfCurrentYear.getFullYear() - 1
}
