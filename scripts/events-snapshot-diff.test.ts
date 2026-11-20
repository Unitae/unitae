import { describe, expect, it } from 'vitest'
import { diffSnapshots } from './events-snapshot-diff'

describe('diffSnapshots', () => {
  it('finds nothing between equal dumps', () => {
    const dump = { congregations: { 1: { board: [{ name: 'Réunion', parts: [1, 2] }] } } }

    expect(diffSnapshots(dump, structuredClone(dump))).toEqual([])
  })

  it('names the path of every value that changed, appeared or went', () => {
    const before = { list: [{ name: 'Réunion', status: 'released' }, { name: 'Mémorial' }], count: 2 }
    const after = { list: [{ name: 'Réunion', status: 'draft' }], count: 2, extra: true }

    expect(diffSnapshots(before, after)).toEqual([
      { path: '$.extra', before: undefined, after: true },
      { path: '$.list.0.status', before: 'released', after: 'draft' },
      { path: '$.list.1', before: { name: 'Mémorial' }, after: undefined },
    ])
  })

  it('leaves out the ignored keys wherever they appear', () => {
    const before = { rows: [{ id: 1, name: 'Discours' }] }
    const after = { rows: [{ id: 1, name: 'Discours', scheduleId: 9 }] }

    expect(diffSnapshots(before, after, new Set(['scheduleId']))).toEqual([])
    expect(diffSnapshots(before, after)).toEqual([{ path: '$.rows.0.scheduleId', before: undefined, after: 9 }])
  })
})
