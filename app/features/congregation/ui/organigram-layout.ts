import type { OrganigramNode } from '~/shared/domain/organigram.queries'

// Turning the tree into the layout the printed sheet uses.
//
// The real "Organisation des services" has no connector lines and no cumulative indentation. It
// groups children under italic band headers — « Sous la responsabilité du secrétaire » — and
// prints everything else as a two-column row. That is what makes an A4 page scannable, and it is
// what stops depth 6 from being unreadable at 390px.
//
// Every rule here is derived from the shape of the tree. None of it is stored, so a congregation
// never has to decide whether something is "a band" — the chart works it out.

export interface RosterBlock {
  kind: 'roster'
  id: number
  title: string
  node: OrganigramNode
}

export interface BandBlock {
  kind: 'band'
  id: number
  title: string
  /**
   * The band's own node. It is rendered as the first row rather than being reduced to a heading:
   * « Coordinateur » holds Marc DUPONT, and turning it into a bare header silently dropped him.
   */
  node: OrganigramNode
  /** Whose responsibility this band falls under — «Sous la responsabilité du coordinateur». */
  under: string | null
  /** Rendered beneath, in order. */
  rows: OrganigramNode[]
}

export interface RowBlock {
  kind: 'row'
  id: number
  node: OrganigramNode
}

export type LayoutBlock = RosterBlock | BandBlock | RowBlock

/** A node earns a band when something below it is itself a container. */
function hasChildUnits(node: OrganigramNode): boolean {
  return node.children.some(child => child.children.length > 0)
}

export function toLayout(tree: OrganigramNode[]): LayoutBlock[] {
  const blocks: LayoutBlock[] = []

  const walk = (node: OrganigramNode, isRoot: boolean, under: string | null = null) => {
    if (node.isRoster) {
      // The rosters print as the masthead: a name list with a count, not a band over everything
      // below them. Repeating « Collège des anciens » as a header is exactly why the standalone
      // services appear unbanded at the bottom of the real sheet.
      blocks.push({ kind: 'roster', id: node.id, title: node.name, node })
      // The roster is the masthead, so what hangs off it is not "under" anything worth naming.
      for (const child of node.children) walk(child, false, null)
      return
    }

    if (node.children.length === 0) {
      blocks.push({ kind: 'row', id: node.id, node })
      return
    }

    if (!hasChildUnits(node) && !isRoot) {
      // Children are all leaves: the node and its people read as one block rather than a header
      // with a single line under it.
      blocks.push({ kind: 'band', id: node.id, title: node.name, node, under, rows: node.children })
      return
    }

    blocks.push({
      kind: 'band',
      id: node.id,
      title: node.name,
      node,
      under,
      rows: node.children.filter(c => c.children.length === 0),
    })
    for (const child of node.children.filter(c => c.children.length > 0)) walk(child, false, node.name)
  }

  for (const node of tree) walk(node, true)
  return blocks
}

export interface FlatEntry {
  id: number
  label: string
  node: OrganigramNode
  parentId: number | null
  parentName: string | null
}

/**
 * Flatten to indented labels for the "move under" select.
 *
 * Non-breaking spaces, not ordinary ones: HTML collapses runs of whitespace inside <option>, so
 * plain indentation renders as a flat list however carefully it is built.
 */
export function flattenTree(tree: OrganigramNode[], depth = 0, parent: OrganigramNode | null = null): FlatEntry[] {
  return tree.flatMap(node => [
    {
      id: node.id,
      label: `${'  '.repeat(depth)}${node.name}`,
      node,
      parentId: parent?.id ?? null,
      parentName: parent?.name ?? null,
    },
    ...flattenTree(node.children, depth + 1, node),
  ])
}
