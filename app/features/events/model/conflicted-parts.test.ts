import { describe, expect, it } from 'vitest'
import { conflictedParts } from './conflicted-parts'

describe('conflictedParts, the parts a draft says « Pas encore publiable » about', () => {
  const draft = { status: 'draft', mayPublish: true }
  const item = (name: string, hasConflict: boolean) => ({ name, hasConflict })

  it.each([
    // The flag covers both slots: a part flagged for its reader alone, with no speaker, still counts.
    [draft, [item('Discours', true), item('Lecture', false)], ['Discours']],
    [draft, [item('Discours', true), item('Lecture', true)], ['Discours', 'Lecture']],
    [draft, [item('Discours', false)], []],
    // Published already, or not the reader's to publish: nothing to say before « Publier ».
    [{ status: 'published', mayPublish: true }, [item('Discours', true)], []],
    [{ status: 'draft', mayPublish: false }, [item('Discours', true)], []],
  ])('%o %o → %o', (schedule, items, parts) => {
    expect(conflictedParts(schedule, items)).toEqual(parts)
  })
})
