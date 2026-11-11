import type { OurBrother, OurListRecipient, OurSpeakerContactChoice, OurSpeakerListPage } from './our-speaker.type'

/**
 * What of a brother's contact goes on our list: the first phone and e-mail from his record (followed when it changes),
 * replaced, or left out; the second of each as typed. Blank lines and repeats drop.
 */
export function sharedContact(
  choice: OurSpeakerContactChoice,
  record: { phone: string; email: string },
): { phones: string[]; emails: string[] } {
  const first = (mode: OurSpeakerContactChoice['phoneMode'], own: string, custom: string) =>
    mode === 'record' ? own : mode === 'custom' ? custom : ''
  const keep = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))]
  return {
    phones: keep([first(choice.phoneMode, record.phone, choice.phoneCustom), choice.phone2]),
    emails: keep([first(choice.emailMode, record.email, choice.emailCustom), choice.email2]),
  }
}

export type SendState = 'never' | 'changed' | 'up-to-date'

/** Where our list stands with a congregation: never sent, sent but changed since, or up to date. */
export function sendState(recipient: Pick<OurListRecipient, 'sentAt' | 'outdated'>): SendState {
  if (recipient.sentAt == null) return 'never'
  return recipient.outdated ? 'changed' : 'up-to-date'
}

/**
 * The list as the other congregations read it — its head, then each brother on it with what is printed of him, in
 * print order — as one string. Stored as a digest with each send, it tells whether a congregation holds today's list:
 * a brother added or gone, a talk or a shared number changed. The day it was made and the candidates left off it are
 * not part of it.
 */
export function ourListContent(page: { header: OurSpeakerListPage['header']; brothers: OurBrother[] }): string {
  return JSON.stringify({
    header: page.header,
    brothers: page.brothers
      .filter(brother => brother.onList)
      .map(brother => [brother.name, brother.note, brother.shared.phones, brother.shared.emails, brother.talks]),
  })
}

/**
 * « Notre liste » as someone who may see it but not edit it reads it: the brothers on the list, each with what goes out
 * and nothing else of his record — not a line he does not share, not a replaced one, not a candidate left off.
 */
export function readerView(page: OurSpeakerListPage): OurSpeakerListPage {
  return {
    ...page,
    brothers: page.brothers
      .filter(brother => brother.onList)
      .map(brother => ({
        ...brother,
        record: {
          phone: brother.phoneMode === 'record' ? brother.record.phone : '',
          email: brother.emailMode === 'record' ? brother.record.email : '',
        },
        phoneCustom: brother.phoneMode === 'custom' ? brother.phoneCustom : '',
        emailCustom: brother.emailMode === 'custom' ? brother.emailCustom : '',
      })),
  }
}
