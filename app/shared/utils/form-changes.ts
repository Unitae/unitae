/** Every value a form posts under one name, in order. */
export function valuesOf(data: FormData, name: string): string[] {
  return data.getAll(name).map(value => (typeof value === 'string' ? value : value.name))
}

function sameValues(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/** Whether a field posts the same values in both snapshots of a form. */
export function fieldChanged(before: FormData, after: FormData, name: string): boolean {
  return !sameValues(valuesOf(before, name), valuesOf(after, name))
}

/**
 * How many fields of a form differ between two snapshots: the number shown as « N modifications non
 * enregistrées ». A field that appeared or went away counts once.
 */
export function countChangedFields(before: FormData, after: FormData): number {
  const names = new Set([...before.keys(), ...after.keys()])
  return [...names].filter(name => fieldChanged(before, after, name)).length
}
