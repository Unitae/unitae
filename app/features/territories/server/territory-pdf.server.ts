/**
 * When dedicated phone territory cards exist (phoneTypeActive=true), phone entrance data
 * is only relevant on those cards — not on regular territory cards.
 * When no dedicated phone cards exist (phoneTypeActive=false), phone data must appear on regular cards.
 */
export function showPhoneOnTerritoryCard(phoneTypeActive: boolean): boolean {
  return !phoneTypeActive
}
