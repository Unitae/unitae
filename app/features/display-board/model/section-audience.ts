/**
 * Who can see a section: everyone for an open one, only the holders of one of its roles for a
 * restricted one. No bypass, admins included: the board shows them exactly what their roles allow.
 * Pure, so the section form counts its audience live with the rule the board applies.
 */
export function sectionAudience<T extends { roleIds: number[] }>(readers: T[], sectionRoleIds: number[]): T[] {
  if (sectionRoleIds.length === 0) return readers
  return readers.filter(reader => reader.roleIds.some(id => sectionRoleIds.includes(id)))
}
