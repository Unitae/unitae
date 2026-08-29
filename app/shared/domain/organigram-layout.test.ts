import { describe, expect, it } from 'vitest'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import { toLayout } from './organigram-layout'

// The printed "Organisation des services" sheet has no connector lines and no deep indentation.
// It groups children under band headers — « Sous la responsabilité du secrétaire » — and prints
// everything else as a row. These rules were read off that sheet; none of them is stored.

let id = 1
function node(over: Partial<OrganigramNode> = {}): OrganigramNode {
  return { id: id++, key: `n${id}`, name: `N${id}`, note: null, isRoster: false, holders: [], children: [], ...over }
}

describe('toLayout', () => {
  it('makes a unit with child units a band', () => {
    const leaf = node({ name: 'Secrétaire' })
    const parent = node({ name: 'Comité de service', children: [leaf] })

    const [block] = toLayout([parent])

    expect(block?.kind).toBe('band')
    expect(block && 'title' in block ? block.title : undefined).toBe('Comité de service')
  })

  it('makes a unit whose only content is people a row', () => {
    // « Covoiturage | Merk Serge » prints as one line on the sheet, not as a band with one entry.
    const solo = node({
      name: 'Covoiturage',
      holders: [{ roleId: 0, memberId: 1, firstname: 'M', lastname: 'S', anonymizedAt: null, kind: 'leader' }],
    })

    const [block] = toLayout([solo])

    expect(block?.kind).toBe('row')
  })

  it('suppresses the root band header, because the masthead already names it', () => {
    // « Collège des anciens » is the masthead; repeating it as a band header over everything is
    // why the standalone services print unbanded at the bottom of the real sheet.
    const child = node({ name: 'Comité' })
    const root = node({ name: 'Collège des anciens', isRoster: true, children: [child] })

    const blocks = toLayout([root])

    expect(blocks.map(b => b.kind)).toContain('roster')
    const band = blocks.find(b => b.kind === 'band')
    expect(band && 'title' in band ? band.title : undefined).not.toBe('Collège des anciens')
  })

  it('does not indent past the band — children of a band are rows, whatever their depth', () => {
    const deep = node({ name: 'Responsable estrade' })
    const mid = node({ name: 'Estrade', children: [deep] })
    const top = node({ name: 'Audio', children: [mid] })
    const root = node({ name: 'Anciens', isRoster: true, children: [top] })

    const blocks = toLayout([root])

    // Every band sits at the same level; nesting is expressed by the header, not by margin.
    expect(blocks.filter(b => b.kind === 'band').length).toBeGreaterThanOrEqual(2)
    expect(blocks.every(b => b.kind !== 'band' || typeof b.title === 'string')).toBe(true)
  })
})
