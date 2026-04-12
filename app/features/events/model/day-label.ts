const DAYS_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

export function dayLabel(weekDay: number): string {
  return DAYS_FULL[weekDay] ?? ''
}

export function dayLabelShort(weekDay: number): string {
  return DAYS_SHORT[weekDay] ?? ''
}
