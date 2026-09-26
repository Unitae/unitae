import * as m from '~/i18n/paraglide/messages'

interface MemberName {
  firstname: string | null
  lastname: string | null
  // Anonymized members keep a placeholder name in the database; it must never be printed.
  anonymizedAt?: Date | null
}

export function formatMemberName(member: MemberName | null): string | null {
  if (!member) return null
  if (member.anonymizedAt != null) return m.board_read_status_anonymized_user()
  const name = `${member.firstname ?? ''} ${member.lastname ?? ''}`.trim()
  return name || null
}

interface PartInput {
  assignee: MemberName | null
  assistant: MemberName | null
  externalSpeaker: { name: string } | null
}

export interface PartAssigneeDisplay {
  primary: string | null
  assistant: string | null
  isExternal: boolean
}

export function getPartAssigneeDisplay(part: PartInput): PartAssigneeDisplay {
  if (part.externalSpeaker) {
    return { primary: part.externalSpeaker.name, assistant: null, isExternal: true }
  }
  return {
    primary: formatMemberName(part.assignee),
    assistant: formatMemberName(part.assistant),
    isExternal: false,
  }
}
