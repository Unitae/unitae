import { describe, expect, it } from 'vitest'
import { pendingBorderClassFor } from './PendingEntranceList'

describe('pendingBorderClassFor', () => {
  it('returns empty string when no pending state', () => {
    expect(pendingBorderClassFor('none')).toBe('')
  })

  it('marks added entrances with a solid primary border', () => {
    expect(pendingBorderClassFor('pending-add')).toContain('border-l-primary/60')
    expect(pendingBorderClassFor('pending-add')).not.toContain('border-dashed')
  })

  it('marks removed entrances with a destructive border', () => {
    expect(pendingBorderClassFor('pending-remove')).toContain('border-l-destructive/60')
  })

  it('marks reassigned entrances with a dashed primary border', () => {
    expect(pendingBorderClassFor('pending-reassign')).toContain('border-l-primary/60')
    expect(pendingBorderClassFor('pending-reassign')).toContain('border-dashed')
  })
})
