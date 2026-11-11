import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OurListRecipient, OurSpeakerListPage } from '~/features/events/model/our-speaker.type'

const sendEmail = vi.fn()
vi.mock('~/shared/infra/mailer.server', () => ({ sendEmail: (...args: unknown[]) => sendEmail(...args) }))
vi.mock('./our-speaker-list-pdf.server', () => ({
  renderOurSpeakerListPdf: () =>
    Promise.resolve({ filename: 'orateurs les lilas 2026-11-11.pdf', content: Buffer.from('%PDF-sentinel'), count: 1 }),
}))

const { sendOurSpeakerList } = await import('./send-our-speaker-list.server')
const { ConflictError } = await import('~/shared/errors/app-error.server')

beforeEach(() => {
  vi.resetAllMocks()
  sendEmail.mockResolvedValue({ id: 'msg' })
})

function recipient(id: number, extra: Partial<OurListRecipient> = {}): OurListRecipient {
  return {
    speakerCongregationId: id,
    name: `Assemblée ${id}`,
    responsibleName: '',
    responsibleEmail: `discours${id}@exemple.fr`,
    coordinatorName: '',
    coordinatorEmail: `coordinateur${id}@exemple.fr`,
    sentAt: null,
    sentManually: false,
    outdated: true,
    ...extra,
  }
}

const brother = {
  memberId: 2,
  name: 'Marc DUPONT',
  appointment: null,
  onList: true,
  talks: [4],
  note: '',
  record: { phone: '', email: '' },
  phoneMode: 'record' as const,
  phoneCustom: '',
  phone2: '',
  emailMode: 'record' as const,
  emailCustom: '',
  email2: '',
  shared: { phones: [], emails: [] },
}

const page: OurSpeakerListPage = {
  candidatesRole: { key: 'orateurs', name: 'Orateurs publics' },
  responsibleRole: { key: 'coord-discours', name: 'Coordinateur du programme des discours publics' },
  header: { coordinator: null, responsible: { name: 'Marc DUPONT', phone: '', email: 'discours.lilas@exemple.fr' } },
  brothers: [brother],
  recipients: [
    recipient(1),
    recipient(2, { coordinatorEmail: '' }),
    recipient(3, { responsibleEmail: '' }),
    recipient(4),
  ],
  changedAt: null,
  digest: 'sha',
}

const congregation = {
  displayName: 'Les Lilas',
  timezone: 'Europe/Paris',
  locale: 'fr',
  emailFrom: 'Les Lilas <noreply@exemple.fr>',
}

const email = {
  speakerCongregationIds: [1, 2, 3],
  copyCoordinators: true,
  subject: 'Notre liste',
  message: 'Bonjour,\n\nCi-joint.',
}

describe('sendOurSpeakerList', () => {
  it('sends each chosen congregation’s public talk coordinator one e-mail, our list attached, replies to ours', async () => {
    const outcome = await sendOurSpeakerList(page, congregation, email, { spacingMs: 0 })

    expect(sendEmail).toHaveBeenCalledTimes(2)
    const [first, second] = sendEmail.mock.calls.map(call => call[0])
    expect(first).toMatchObject({
      from: 'Les Lilas <noreply@exemple.fr>',
      to: ['discours1@exemple.fr'],
      cc: ['coordinateur1@exemple.fr'],
      replyTo: 'discours.lilas@exemple.fr',
      subject: 'Notre liste',
      text: 'Bonjour,\n\nCi-joint.',
    })
    expect(first.attachments).toEqual([
      { filename: 'orateurs les lilas 2026-11-11.pdf', content: Buffer.from('%PDF-sentinel') },
    ])
    // No coordinator address known: nobody in copy, rather than an empty one.
    expect(second.to).toEqual(['discours2@exemple.fr'])
    expect(second.cc).toBeUndefined()
    // Congregation 3 has no address; congregation 4 was not chosen.
    expect(outcome.sent.map(each => each.speakerCongregationId)).toEqual([1, 2])
    expect(outcome.failed).toEqual([])
  })

  it('copies their coordinators only when asked', async () => {
    await sendOurSpeakerList(page, congregation, { ...email, copyCoordinators: false }, { spacingMs: 0 })

    expect(sendEmail.mock.calls.every(call => call[0].cc === undefined)).toBe(true)
  })

  it('keeps sending to the others when one e-mail is refused, and says which one did not go', async () => {
    sendEmail.mockRejectedValueOnce(new Error('The exemple.fr domain is not verified')).mockResolvedValue({ id: 'msg' })

    const outcome = await sendOurSpeakerList(page, congregation, email, { spacingMs: 0 })

    expect(outcome.failed.map(each => each.speakerCongregationId)).toEqual([1])
    expect(outcome.sent.map(each => each.speakerCongregationId)).toEqual([2])
  })

  it('sends nothing while nobody is on our list', async () => {
    const empty = { ...page, brothers: [{ ...brother, onList: false }] }

    await expect(sendOurSpeakerList(empty, congregation, email, { spacingMs: 0 })).rejects.toThrow(ConflictError)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
