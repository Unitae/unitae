import { describe, expect, it } from 'vitest'
import * as m from '~/i18n/paraglide/messages'
import { TerritoryAccess } from '../model/territory-access.type'
import { entranceAccessLabels } from './entrance-access-labels'

const NONE = { access: null, accesses: [], isPMR: false, isOpenEarly: false, isMailboxOpen: false }

describe('entranceAccessLabels', () => {
  it('says how to get in, from the main way in and the others', () => {
    expect(
      entranceAccessLabels({ ...NONE, access: TerritoryAccess.Intercom, accesses: [{ type: TerritoryAccess.Code }] }),
    ).toEqual([m.territories_map_popup_access_intercom(), m.territories_map_popup_access_digicode()])
  })

  it('adds what a code allows, and whether a wheelchair gets in', () => {
    expect(
      entranceAccessLabels({
        ...NONE,
        access: TerritoryAccess.Code,
        isOpenEarly: true,
        isMailboxOpen: true,
        isPMR: true,
      }),
    ).toEqual([
      m.territories_map_popup_access_digicode(),
      m.territories_map_popup_access_open_early(),
      m.territories_map_popup_access_mailbox_open(),
      m.territories_map_popup_access_pmr(),
    ])
  })

  it('ignores the code’s details without a code', () => {
    expect(entranceAccessLabels({ ...NONE, access: TerritoryAccess.Doorbell, isOpenEarly: true })).toEqual([
      m.territories_map_popup_access_doorbell(),
    ])
  })

  it('says nothing when the way in is unknown', () => {
    expect(entranceAccessLabels(NONE)).toEqual([])
    expect(entranceAccessLabels({})).toEqual([])
  })
})
