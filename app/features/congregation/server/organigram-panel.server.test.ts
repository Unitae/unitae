import { describe, expect, it } from 'vitest'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import type { FlatEntry } from '~/shared/domain/organigram-layout'
import { buildMoveTargets, buildPanelNode } from './organigram-panel.server'

// Pure assembly for the organigram page: flat entries in, panel shape and legal move targets
// out. Extracted from the route loader so the flag wiring is testable without a request.

let nextId = 1
function node(over: Partial<OrganigramNode> = {}): OrganigramNode {
  return {
    id: nextId++,
    key: `service-${nextId}`,
    name: `Service ${nextId}`,
    note: null,
    isRoster: false,
    isSinglePerson: false,
    holders: [],
    children: [],
    ...over,
  }
}

function entry(over: Partial<FlatEntry> & { node: OrganigramNode }): FlatEntry {
  return { id: over.node.id, label: over.node.name, parentId: null, parentName: null, ...over }
}

describe('buildPanelNode', () => {
  it('marks a committee post fixed, personal, and a post', () => {
    const post = node({ key: 'coordinator', isSinglePerson: true })

    const panel = buildPanelNode(entry({ node: post }))

    expect(panel.isFixed).toBe(true)
    expect(panel.isPost).toBe(true)
    expect(panel.isCommittee).toBe(false)
    expect(panel.isSinglePerson).toBe(true)
  })

  it('carries a custom personal role’s flag without fixing it in place', () => {
    const custom = node({ key: 'responsable-audio-video', isSinglePerson: true })

    const panel = buildPanelNode(entry({ node: custom }))

    expect(panel.isSinglePerson).toBe(true)
    expect(panel.isFixed).toBe(false)
    expect(panel.isPost).toBe(false)
  })

  it('formats holders with the lastname in capitals', () => {
    const service = node({
      holders: [{ roleId: 1, memberId: 9, firstname: 'Marc', lastname: 'Dupont', anonymizedAt: null, kind: 'leader' }],
    })

    const panel = buildPanelNode(entry({ node: service }))

    expect(panel.holders).toEqual([{ memberId: 9, name: 'Marc DUPONT', kind: 'leader' }])
  })
})

describe('buildMoveTargets', () => {
  it('excludes the selected node and everything under it', () => {
    const child = node({})
    const parent = node({ children: [child] })
    const other = node({})
    const flat: FlatEntry[] = [
      entry({ node: parent }),
      entry({ node: child, parentId: parent.id, parentName: parent.name }),
      entry({ node: other }),
    ]

    const targets = buildMoveTargets(flat, flat[0])

    expect(targets.map(target => target.id)).toEqual([other.id])
  })

  it('offers every node when nothing is selected', () => {
    const a = node({})
    const b = node({})
    const flat = [entry({ node: a }), entry({ node: b })]

    expect(buildMoveTargets(flat, undefined)).toHaveLength(2)
  })
})
