import type { OrganigramNode } from '~/shared/domain/organigram.queries'

// Turning the tree into the layout the printed sheet uses.
//
// The real "Organisation des services" has no connector lines and no cumulative indentation. It
// reads in a fixed order: the two rosters as the masthead, the service committee and who
// composes it, then each committee post's services under an italic « Sous la responsabilité »
// header, and finally the services the collège des anciens keeps for itself. Everything else is
// a two-column row. That is what makes an A4 page scannable, and it is what stops depth 6 from
// being unreadable at 390px.
//
// Every rule here is derived from the shape of the tree. None of it is stored, so a congregation
// never has to decide whether something is "a band" — the chart works it out.

// Mirrors SERVICE_COMMITTEE_KEY / SERVICE_COMMITTEE_POST_KEYS in built-in-roles.server.ts,
// which this client-bundled file cannot import. The keys are the migration's contract and
// change together or not at all.
const COMMITTEE_KEY = 'service-committee'
const POST_KEYS: readonly string[] = ['coordinator', 'secretary', 'service-overseer']

export interface RosterBlock {
  kind: 'roster'
  id: number
  title: string
  node: OrganigramNode
}

/**
 * The committee and who composes it. Its own block, never a band: the coordinator is not
 * « sous la responsabilité » of the committee — he is part of it.
 */
export interface CommitteeBlock {
  kind: 'committee'
  id: number
  node: OrganigramNode
  /** The posts, in canonical order, each carrying its titulaire and adjoints. */
  posts: OrganigramNode[]
}

export interface BandBlock {
  kind: 'band'
  id: number
  /**
   * The band's own node, rendered as the first row rather than reduced to a heading —
   * « Audio/Vidéo » holds Philippe MARTIN, and a bare header silently dropped him. Null for a
   * collector band: a branch's direct leaf services, which share the header but have no
   * container of their own.
   */
  node: OrganigramNode | null
  /** Whose responsibility this band falls under — «Sous la responsabilité : Coordinateur». */
  under: string | null
  /** Rendered beneath, in order. */
  rows: OrganigramNode[]
}

export interface RowBlock {
  kind: 'row'
  id: number
  node: OrganigramNode
}

export type LayoutBlock = RosterBlock | CommitteeBlock | BandBlock | RowBlock

/** A node earns a band when something below it is itself a container. */
function hasChildUnits(node: OrganigramNode): boolean {
  return node.children.some(child => child.children.length > 0)
}

export function toLayout(tree: OrganigramNode[]): LayoutBlock[] {
  const blocks: LayoutBlock[] = []

  /** A container and everything below it, as sibling bands — depth costs a header, never margin. */
  const walkContainer = (node: OrganigramNode, under: string | null) => {
    if (!hasChildUnits(node)) {
      // Children are all leaves: the node and its people read as one block.
      blocks.push({ kind: 'band', id: node.id, node, under, rows: node.children })
      return
    }
    blocks.push({ kind: 'band', id: node.id, node, under, rows: node.children.filter(c => c.children.length === 0) })
    for (const child of node.children.filter(c => c.children.length > 0)) walkContainer(child, node.name)
  }

  /** One branch of the sheet: the leaves share a collector band, the containers band themselves. */
  const emitBranch = (nodes: OrganigramNode[], under: string | null) => {
    const leaves = nodes.filter(child => child.children.length === 0)
    if (leaves.length > 0) {
      if (under == null) {
        // Nothing to hang a header on: legacy roots print as plain rows, as they always did.
        for (const leaf of leaves) blocks.push({ kind: 'row', id: leaf.id, node: leaf })
      } else {
        blocks.push({ kind: 'band', id: leaves[0]?.id ?? 0, node: null, under, rows: leaves })
      }
    }
    for (const child of nodes.filter(child => child.children.length > 0)) walkContainer(child, under)
  }

  // 1. The masthead: both rosters lead, so the assistants no longer sink below the elder branch.
  const rosters = tree.filter(node => node.isRoster)
  const others = tree.filter(node => !node.isRoster)
  for (const roster of rosters) blocks.push({ kind: 'roster', id: roster.id, title: roster.name, node: roster })

  // 2. The committee, composed of its posts — then each post's branch, in canonical post order.
  const committee = rosters.flatMap(roster => roster.children).find(child => child.key === COMMITTEE_KEY)
  if (committee) {
    const posts = POST_KEYS.flatMap(key => committee.children.filter(child => child.key === key))
    blocks.push({ kind: 'committee', id: committee.id, node: committee, posts })
    for (const post of posts) emitBranch(post.children, post.name)
    // A service attached to the committee itself rather than to a post — rare, but not lost.
    emitBranch(
      committee.children.filter(child => !POST_KEYS.includes(child.key)),
      committee.name,
    )
  }

  // 3. The services the rosters keep for themselves close the sheet. The elder roster's
  // branch answers to the body, not to a list: « sous la responsabilité du Collège des
  // anciens », never « des Anciens ».
  for (const roster of rosters) {
    emitBranch(
      roster.children.filter(child => child.key !== COMMITTEE_KEY),
      roster.key === 'elder' ? 'Collège des anciens' : roster.name,
    )
  }

  // 4. Legacy roots outside the rosters: still printed, exactly as before the sheet had an order.
  emitBranch(others, null)

  return blocks
}

/** Either leadership title in a role's own name makes the one beside its leader redundant. */
const LEADER_TITLE_PREFIXES = ['responsable', 'préposé']

/**
 * The title shown beside a holder's name, or null when it would say nothing true.
 *
 * The vocabulary is the congregation's, not the app's: « responsable » is an elder's title, and
 * a brother who is not an elder leads a service as its « préposé ».
 *
 * On a personal role the titulaire gets no title: « Coordinateur du collège des anciens —
 * RESPONSABLE Marc DUPONT » makes no sense, because nobody is responsible *of* a one-person
 * role — the node name is the function and the person simply holds it. Its adjoints keep
 * theirs, since « adjoint » is exactly what they are.
 *
 * The name-prefix check covers roles named « Responsable de … » or « Préposé aux … » that carry
 * the title in their own name — eleven redundant labels on a real congregation's chart.
 */
export function seatLabel(
  holder: { kind: string; isElder: boolean },
  node: Pick<OrganigramNode, 'name' | 'isSinglePerson'>,
): string | null {
  const name = node.name.toLocaleLowerCase()

  // A deputy stays labelled on « Responsable de l'accueil » — that node name carries the
  // leader's title, not the adjoint's.
  if (holder.kind === 'deputy') return name.startsWith('adjoint') ? null : 'Adjoint'

  if (holder.kind !== 'leader' || node.isSinglePerson) return null
  if (LEADER_TITLE_PREFIXES.some(prefix => name.startsWith(prefix))) return null
  return holder.isElder ? 'Responsable' : 'Préposé'
}

export interface GroupedLayout {
  rosters: RosterBlock[]
  committee: CommitteeBlock | null
  /** Consecutive bands sharing a responsibility header — `toLayout` emits each branch contiguously. */
  sections: { under: string; bands: BandBlock[] }[]
  /** Legacy roots outside the sheet's order: plain rows, and bands no header ever claimed. */
  legacy: (BandBlock | RowBlock)[]
}

/** The renderer's view of the sheet — shared by the screen and the printable PDF. */
export function groupLayout(blocks: LayoutBlock[]): GroupedLayout {
  const grouped: GroupedLayout = { rosters: [], committee: null, sections: [], legacy: [] }
  for (const block of blocks) {
    if (block.kind === 'roster') grouped.rosters.push(block)
    else if (block.kind === 'committee') grouped.committee = block
    else if (block.kind === 'band' && block.under != null) {
      const current = grouped.sections[grouped.sections.length - 1]
      if (current && current.under === block.under) current.bands.push(block)
      else grouped.sections.push({ under: block.under, bands: [block] })
    } else grouped.legacy.push(block)
  }
  return grouped
}

const FIRST_WORD = /^\S+/
const STARTS_WITH_VOWEL = /^[aeiouyhàâäéèêëîïôöùûü]/

/**
 * The eyebrow reads as one phrase with the name beneath it, so it has to contract correctly:
 * « du » Coordinateur, « des » Anciens, « de l’ » Audio/Vidéo. A heuristic, because a band can
 * carry any service name — plural first (a first word ending in s), vowels next, « du » as the
 * default the sheet actually uses for every masculine post.
 */
export function responsibilityEyebrow(name: string): string {
  const first = (name.trim().match(FIRST_WORD)?.[0] ?? '').toLocaleLowerCase()
  if (first.endsWith('s')) return 'Sous la responsabilité des'
  if (STARTS_WITH_VOWEL.test(first)) return 'Sous la responsabilité de l’'
  return 'Sous la responsabilité du'
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
