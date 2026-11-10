import { describe, expect, it } from 'vitest'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'

import { editorRefusal } from './territory-editor-refusal.server'
import { EntranceTakenError } from './territory-entrances.server'

describe('editorRefusal', () => {
  it('names the entrance and the territory that holds it', () => {
    const refusal = editorRefusal(
      new EntranceTakenError([{ id: 8, address: '8 Rue des Coteaux', territoryNumber: 'T09' }]),
      'T02',
    )

    expect(refusal?.kind).toBe('entrance-taken')
    expect(refusal?.message).toContain('8 Rue des Coteaux')
    expect(refusal?.message).toContain('T09')
  })

  it('lists several taken entrances with their territories', () => {
    const refusal = editorRefusal(
      new EntranceTakenError([
        { id: 8, address: '8 Rue des Coteaux', territoryNumber: 'T09' },
        { id: 9, address: '10 Rue des Coteaux', territoryNumber: 'T11' },
      ]),
      'T02',
    )

    expect(refusal?.kind === 'entrance-taken' && refusal.entrances.map(entrance => entrance.id)).toEqual([8, 9])
    expect(refusal?.message).toContain('10 Rue des Coteaux (T11)')
  })

  it('says the number is taken', () => {
    const refusal = editorRefusal(new ConflictError('territory_number_taken'), 'T13')

    expect(refusal?.kind).toBe('number-taken')
    expect(refusal?.message).toContain('T13')
  })

  it('is not a refusal for any other error', () => {
    expect(editorRefusal(new ConflictError('campaign_overlap'), 'T02')).toBeNull()
    expect(editorRefusal(new NotFoundError('Territory'), 'T02')).toBeNull()
    expect(editorRefusal(new Error('boom'), 'T02')).toBeNull()
  })
})
