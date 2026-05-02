import { describe, expect, it } from 'vitest'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import { pinVariantFor } from './entrance-pin-variant'

const baseEntrance = (status: BboxEntrance['status']): BboxEntrance => ({
  id: 1,
  latitude: 48.85,
  longitude: 2.35,
  kind: EntranceKind.Residential,
  shopKind: '',
  homes: 0,
  phones: 0,
  liberals: 0,
  address: { number: '1', street: 'Rue X', zip: '75001' },
  status,
  otherTerritory: status === 'on-other-territory' ? { id: 99, number: 'T99' } : null,
})

describe('pinVariantFor', () => {
  describe('pending state takes precedence over base status', () => {
    it('maps pending-remove to the destructive variant regardless of base status', () => {
      expect(pinVariantFor(baseEntrance('in-this-territory'), 'pending-remove')).toBe('pending-remove')
      expect(pinVariantFor(baseEntrance('available'), 'pending-remove')).toBe('pending-remove')
    })

    it('maps pending-add to the constructive blue+plus variant', () => {
      expect(pinVariantFor(baseEntrance('available'), 'pending-add')).toBe('pending-add')
    })

    it('also maps pending-reassign to the same pending-add variant (visual identity is shared)', () => {
      expect(pinVariantFor(baseEntrance('on-other-territory'), 'pending-reassign')).toBe('pending-add')
    })
  })

  describe('base status drives the variant when nothing is pending', () => {
    it('in-this-territory → in-territory (blue + check)', () => {
      expect(pinVariantFor(baseEntrance('in-this-territory'), 'none')).toBe('in-territory')
    })

    it('available → available (green)', () => {
      expect(pinVariantFor(baseEntrance('available'), 'none')).toBe('available')
    })

    it('on-other-territory → on-other (grey hollow)', () => {
      expect(pinVariantFor(baseEntrance('on-other-territory'), 'none')).toBe('on-other')
    })
  })
})
