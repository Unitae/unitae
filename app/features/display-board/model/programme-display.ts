import * as m from '~/paraglide/messages'

export type UserNameInfo = {
  firstname: string | null
  lastname: string | null
  anonymizedAt: Date | null
} | null

export interface PartDisplayLike {
  externalSpeakerName: string | null
  assignee: UserNameInfo
  assistant: UserNameInfo
}

export interface PartDisplay {
  text: string | null
  isExternal: boolean
}

export function formatName(user: UserNameInfo): string | null {
  if (!user) return null
  if (user.anonymizedAt != null) return m.board_read_status_anonymized_user()
  const name = [user.firstname, user.lastname].filter(Boolean).join(' ')
  return name || null
}

export function formatAssigneeWithAssistant(assignee: string | null, assistant: string | null): string | null {
  if (!assignee) return null
  if (assistant) return `${assignee} / ${assistant}`
  return assignee
}

export function nameMatches(user: UserNameInfo, query: string): boolean {
  const name = formatName(user)
  if (!name) return false
  return name.toLowerCase().includes(query)
}

export function getPartDisplay(part: PartDisplayLike): PartDisplay {
  if (part.externalSpeakerName) return { text: part.externalSpeakerName, isExternal: true }
  const assigneeName = formatName(part.assignee)
  const assistantName = formatName(part.assistant)
  return { text: formatAssigneeWithAssistant(assigneeName, assistantName), isExternal: false }
}

export function partMatchesQuery(part: PartDisplayLike, query: string): boolean {
  if (part.externalSpeakerName?.toLowerCase().includes(query)) return true
  return nameMatches(part.assignee, query) || nameMatches(part.assistant, query)
}
