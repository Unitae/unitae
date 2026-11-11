// What the external-speakers screens read. Client-safe: the loaders hand these to the page as they are.

/** A congregation whose list of public speakers we receive. */
export interface DirectoryCongregation {
  id: number
  name: string
  responsibleName: string
  responsiblePhone: string
  responsibleEmail: string
  coordinatorName: string
  coordinatorPhone: string
  coordinatorEmail: string
  /** The date written on its latest list. */
  listDate: Date | null
  /** Name of the kept PDF of that list, if one was imported. */
  listFileName: string | null
  notes: string
}

export interface SpeakerNextVisit {
  date: Date
  eventId: number
  status: string
}

export interface DirectorySpeaker {
  id: number
  name: string
  speakerCongregationId: number | null
  /** The free text an older version stored for a speaker it created without a congregation; null otherwise. */
  legacyCongregationName: string | null
  phone: string | null
  phone2: string | null
  email: string | null
  email2: string | null
  notes: string | null
  talks: number[]
  /** « Retiré de la liste » since this date. */
  retiredAt: Date | null
  lastVisit: Date | null
  nextVisit: SpeakerNextVisit | null
  visitCount: number
}

export interface SpeakerDirectory {
  congregations: DirectoryCongregation[]
  speakers: DirectorySpeaker[]
}

export interface SpeakerVisit {
  eventId: number
  date: Date
  partName: string
  topic: string
  status: string
}

export interface SpeakerVisits {
  upcoming: SpeakerVisit[]
  past: SpeakerVisit[]
}

/** A speaker offered in the assign panel. */
export interface ExternalSpeakerOption {
  id: number
  name: string
  congregationName: string
  talks: number[]
}
