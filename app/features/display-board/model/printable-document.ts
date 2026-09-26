import { DynamicType } from './dynamic-document.type'

// Whether a dynamic document can be downloaded as a PDF. One rule for the viewer's button and
// for the download route, so the button never offers a file the route would refuse. An empty
// document is not printable: its PDF would be a blank page, read as a bug.

// Structural on purpose — model/ cannot import the server's return type — but one variant per
// type, so renaming a payload field breaks the build instead of silently hiding the button.
type DynamicDocumentShape =
  | { type: typeof DynamicType.Organigram; tree: readonly unknown[] }
  | { type: typeof DynamicType.PublisherGroups; groups: readonly unknown[] }
  | { type: typeof DynamicType.Pioneers; pioneers: readonly unknown[] }
  | { type: typeof DynamicType.Programme; events: readonly unknown[] }

export function isPrintableDynamicDocument(data: DynamicDocumentShape): boolean {
  switch (data.type) {
    case DynamicType.Organigram:
      return data.tree.length > 0
    case DynamicType.PublisherGroups:
      return data.groups.length > 0
    case DynamicType.Pioneers:
      return data.pioneers.length > 0
    case DynamicType.Programme:
      return data.events.length > 0
    default:
      return false
  }
}
