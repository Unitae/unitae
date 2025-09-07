export function unserializeSharedEntranceFormValue(
  formValue: FormDataEntryValue | null,
  defaultBuildingId: number,
): number[] {
  if (formValue == null || formValue === '') {
    return [defaultBuildingId]
  }

  return formValue.toString().split(',').map(Number)
}
