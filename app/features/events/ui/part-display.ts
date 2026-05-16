interface MemberName {
  firstname: string | null
  lastname: string | null
}

export function formatMemberName(member: MemberName | null): string | null {
  if (!member) return null
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
