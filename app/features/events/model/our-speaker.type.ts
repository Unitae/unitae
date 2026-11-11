// « Notre liste »: what the page and the PDF read. Client-safe.

/** How the first phone or e-mail of a brother goes on the list: from his record, replaced, or left out. */
export const CONTACT_MODES = ['record', 'custom', 'hidden'] as const
export type ContactMode = (typeof CONTACT_MODES)[number]

export interface OurSpeakerContactChoice {
  phoneMode: ContactMode
  phoneCustom: string
  phone2: string
  emailMode: ContactMode
  emailCustom: string
  email2: string
}

/** A candidate: a member of the role chosen in Réglages, on our list or not. */
export interface OurBrother extends OurSpeakerContactChoice {
  memberId: number
  name: string
  /** « Ancien », « Assistant ministériel », or nothing. */
  appointment: 'elder' | 'servant' | null
  onList: boolean
  talks: number[]
  note: string
  /** His own phone and e-mail, as on his record. */
  record: { phone: string; email: string }
  /** What goes on the list. */
  shared: { phones: string[]; emails: string[] }
}

export interface OurListContact {
  name: string
  phone: string
  email: string
}

/** A congregation whose list we receive, as a recipient of ours. */
export interface OurListRecipient {
  speakerCongregationId: number
  name: string
  responsibleName: string
  responsibleEmail: string
  coordinatorName: string
  coordinatorEmail: string
  sentAt: Date | null
  sentManually: boolean
  /** They do not hold today's list: it changed since it was sent, or it never was. */
  outdated: boolean
}

export interface OurSpeakerListPage {
  /** The role whose members are the candidates; null until chosen in Réglages. */
  candidatesRole: { key: string; name: string } | null
  responsibleRole: { key: string; name: string } | null
  header: { coordinator: OurListContact | null; responsible: OurListContact | null }
  brothers: OurBrother[]
  recipients: OurListRecipient[]
  /** When a brother on the list, or his record, was last edited: « Modifiée le … ». */
  changedAt: Date | null
  /** A digest of the list as it would be sent today, stored with each send to tell who holds the current one. */
  digest: string
}
