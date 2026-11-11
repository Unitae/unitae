import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TransactionClient } from '~/shared/infra/db.server'

const isEmailConfigured = vi.fn()
vi.mock('~/shared/infra/mailer.server', () => ({ isEmailConfigured: () => isEmailConfigured() }))
const getOurSpeakerListPage = vi.fn()
vi.mock('~/features/events/server/our-speakers.queries', () => ({ getOurSpeakerListPage }))
const markOurListSent = vi.fn()
const updateOurSpeaker = vi.fn()
vi.mock('~/features/events/server/our-speakers.server', () => ({ markOurListSent, updateOurSpeaker }))
const sendOurSpeakerList = vi.fn()
vi.mock('~/features/events/server/send-our-speaker-list.server', () => ({ sendOurSpeakerList }))

const { runOurListIntent } = await import('./_our-list-action.server')
const { ConflictError } = await import('~/shared/errors/app-error.server')

// Each transaction the action opens is counted, to prove the e-mails go out between two of them, never inside one.
let transactions = 0
const withScope = <T>(fn: (db: TransactionClient, congregationId: number) => Promise<T>) => {
  transactions++
  return fn({} as TransactionClient, 10)
}
const context = {
  actorId: 99,
  congregation: { displayName: 'Les Lilas', timezone: 'Europe/Paris', locale: 'fr', emailFrom: 'x <noreply@x.fr>' },
  withScope,
}
const recipient = (id: number) => ({ speakerCongregationId: id, name: `Assemblée ${id}` })
const send = {
  intent: 'send' as const,
  speakerCongregationIds: [1, 2],
  copyCoordinators: false,
  subject: 'S',
  message: 'M',
}

beforeEach(() => {
  vi.resetAllMocks()
  transactions = 0
  isEmailConfigured.mockReturnValue(true)
  getOurSpeakerListPage.mockResolvedValue({ brothers: [], digest: 'sha-of-today' })
  markOurListSent.mockResolvedValue(1)
})

describe('runOurListIntent — sending', () => {
  it('records as sent only the congregations the e-mail reached, after sending outside any transaction', async () => {
    sendOurSpeakerList.mockResolvedValue({ sent: [recipient(1), recipient(2)], failed: [] })

    const outcome = await runOurListIntent(send, context)

    expect(outcome).toMatchObject({ ok: true })
    expect(transactions).toBe(2)
    // With the digest of the list that went, so « Envois » can tell whether they hold today's.
    expect(markOurListSent.mock.calls[0]?.[3]).toMatchObject({
      speakerCongregationIds: [1, 2],
      manual: false,
      digest: 'sha-of-today',
    })
  })

  it('says which congregations it could not reach, and records the others', async () => {
    sendOurSpeakerList.mockResolvedValue({ sent: [recipient(1)], failed: [recipient(2)] })

    const outcome = await runOurListIntent(send, context)

    expect(outcome.ok && outcome.message).toContain('Assemblée 2')
    expect(markOurListSent.mock.calls[0]?.[3]).toMatchObject({ speakerCongregationIds: [1] })
  })

  it('records nothing and refuses when no e-mail went', async () => {
    sendOurSpeakerList.mockResolvedValue({ sent: [], failed: [recipient(1), recipient(2)] })

    const outcome = await runOurListIntent(send, context)

    expect(outcome).toMatchObject({ ok: false, status: 502 })
    expect(markOurListSent).not.toHaveBeenCalled()
  })

  it('refuses on an installation that sends no e-mail, before reading anything', async () => {
    isEmailConfigured.mockReturnValue(false)

    expect(await runOurListIntent(send, context)).toMatchObject({ ok: false, status: 400 })
    expect(sendOurSpeakerList).not.toHaveBeenCalled()
  })

  it('refuses a list nobody is on', async () => {
    sendOurSpeakerList.mockRejectedValue(new ConflictError('Nobody is on our list yet'))

    expect(await runOurListIntent(send, context)).toMatchObject({ ok: false, status: 409 })
  })
})

describe('runOurListIntent — marking sent', () => {
  it('counts a list marked sent today as sent now, so a change made this morning is covered', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
    const before = Date.now()

    await runOurListIntent({ intent: 'mark-sent', speakerCongregationIds: [3], sentOn: today }, context)

    const [[, , , { sentAt, manual, digest }]] = markOurListSent.mock.calls
    expect(manual).toBe(true)
    expect(digest).toBe('sha-of-today')
    expect(sentAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('takes an earlier day at midday in the congregation’s timezone', async () => {
    await runOurListIntent({ intent: 'mark-sent', speakerCongregationIds: [3], sentOn: '2026-10-03' }, context)

    expect(markOurListSent.mock.calls[0]?.[3].sentAt).toEqual(new Date('2026-10-03T10:00:00Z'))
  })
})

describe('runOurListIntent — a brother’s entry', () => {
  it('turns « no longer a candidate » into words for the panel', async () => {
    updateOurSpeaker.mockRejectedValue(new ConflictError('Not a candidate'))

    const outcome = await runOurListIntent(
      {
        intent: 'brother-update',
        memberId: 2,
        onList: true,
        talks: [],
        phoneMode: 'record',
        phoneCustom: '',
        phone2: '',
        emailMode: 'record',
        emailCustom: '',
        email2: '',
        note: '',
      },
      context,
    )

    expect(outcome).toMatchObject({ ok: false, status: 409 })
  })
})
