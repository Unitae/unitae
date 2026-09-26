import { DynamicType } from './dynamic-document.type'

// Whether a dynamic document can be downloaded as a PDF. One rule for the viewer's button and
// for the download route, so the button never offers a file the route would refuse. An empty
// document is not printable: its PDF would be a blank page, read as a bug.

interface DynamicDocumentShape {
  type: string
  tree?: unknown[]
  groups?: unknown[]
  pioneers?: unknown[]
  events?: unknown[]
}

export function isPrintableDynamicDocument(data: DynamicDocumentShape): boolean {
  if (data.type === DynamicType.Organigram) return (data.tree?.length ?? 0) > 0
  if (data.type === DynamicType.PublisherGroups) return (data.groups?.length ?? 0) > 0
  if (data.type === DynamicType.Pioneers) return (data.pioneers?.length ?? 0) > 0
  if (data.type === DynamicType.Programme) return (data.events?.length ?? 0) > 0
  return false
}
