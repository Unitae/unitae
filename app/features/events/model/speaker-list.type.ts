// A congregation's list of speakers, as received and as saved. Client-safe: the update screen builds these and posts
// them; the server applies them in one transaction.

/** What a list gives for one speaker. Two phones and two e-mails at most, as the lists carry. */
export interface ListSpeakerFields {
  name: string
  phone: string
  phone2: string
  email: string
  email2: string
  talks: number[]
}

/** The two contacts a list gives at its head. */
export interface SpeakerCongregationContacts {
  responsibleName: string
  responsiblePhone: string
  responsibleEmail: string
  coordinatorName: string
  coordinatorPhone: string
  coordinatorEmail: string
}

/** One change a list update makes. An unchanged speaker makes none. */
export type SpeakerListChange =
  /** A speaker new to us. */
  | { kind: 'create'; fields: ListSpeakerFields }
  /** A speaker of this congregation, corrected — or back on the list if they had been retired. */
  | { kind: 'update'; speakerId: number; fields: ListSpeakerFields }
  /** A speaker we knew in another congregation, who now belongs to this one: visits and talks follow. */
  | { kind: 'move'; speakerId: number; fields: ListSpeakerFields }
  /** A speaker of this congregation absent from the new list. */
  | { kind: 'retire'; speakerId: number }
