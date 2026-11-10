import { describe, expect, it, vi } from 'vitest'
import { getAccountProfile } from './account-profile.queries'

function fakeDb(account: unknown) {
  return { userAccount: { findFirst: vi.fn().mockResolvedValue(account) } } as never
}

const MEMBER = { id: 41, firstname: 'Claire', lastname: 'André', isPublisher: true, publisherGroup: null }

describe('getAccountProfile', () => {
  it('names the account after its publisher record, with the login e-mail', async () => {
    const profile = await getAccountProfile(
      fakeDb({ email: 'claire@exemple.fr', firstname: null, lastname: null, member: MEMBER }),
      7,
    )

    expect(profile).toMatchObject({
      firstname: 'Claire',
      lastname: 'André',
      email: 'claire@exemple.fr',
      record: 'publisher',
    })
  })

  it('says when the record is not a publisher yet', async () => {
    const profile = await getAccountProfile(
      fakeDb({ email: 'e@x.fr', firstname: null, lastname: null, member: { ...MEMBER, isPublisher: false } }),
      7,
    )

    expect(profile?.record).toBe('not-publisher')
  })

  it('falls back to the account name when no record is linked', async () => {
    const profile = await getAccountProfile(
      fakeDb({ email: 'secretariat@exemple.fr', firstname: 'Secrétariat', lastname: 'Assemblée', member: null }),
      7,
    )

    expect(profile).toMatchObject({ firstname: 'Secrétariat', lastname: 'Assemblée', record: 'none', group: null })
  })

  it('names the overseer of the group as the person to tell about a mistake', async () => {
    const group = { name: 'Nord', responsible: { id: 12, firstname: 'Jean-Pierre', lastname: 'Bernard' } }
    const profile = await getAccountProfile(
      fakeDb({ email: 'e@x.fr', firstname: null, lastname: null, member: { ...MEMBER, publisherGroup: group } }),
      7,
    )

    expect(profile?.group).toEqual({ name: 'Nord', overseer: { firstname: 'Jean-Pierre', lastname: 'Bernard' } })
  })

  it('names no one when the person leads the group themselves', async () => {
    const group = { name: 'Centre', responsible: { id: 41, firstname: 'Claire', lastname: 'André' } }
    const profile = await getAccountProfile(
      fakeDb({ email: 'e@x.fr', firstname: null, lastname: null, member: { ...MEMBER, publisherGroup: group } }),
      7,
    )

    expect(profile?.group).toEqual({ name: 'Centre', overseer: null })
  })

  it('returns null when the account does not exist', async () => {
    expect(await getAccountProfile(fakeDb(null), 999)).toBeNull()
  })

  it('reads the account by id', async () => {
    const db = fakeDb(null)
    await getAccountProfile(db, 7)

    expect(vi.mocked((db as { userAccount: { findFirst: () => void } }).userAccount.findFirst).mock.calls[0]).toEqual([
      expect.objectContaining({ where: { id: 7 } }),
    ])
  })
})
