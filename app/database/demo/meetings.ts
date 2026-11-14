import { PartPresetKey } from '../../features/events/model/part-preset.type'
import { ABSENCE_NAMES, LAST_NAMES, MALE_FIRST_NAMES, NEARBY_TOWNS, TALK_TITLES } from './names'
import type { PersonSeed } from './people'
import { MEETINGS } from './profile'
import { Random } from './random'

const DAY = 24 * 60 * 60 * 1000
const YEAR = 365.25 * DAY

/** What a part of a meeting is, as far as choosing who gives it goes. */
export type PartKind =
  | 'chairman'
  | 'prayer'
  | 'joyaux'
  | 'perles'
  | 'vcm'
  | 'bible-reading'
  | 'ministry'
  | 'cbs'
  | 'public-talk'
  | 'watchtower'
  | 'song'

export type MeetingKind = 'midweek' | 'weekend'

export interface TemplateSpec {
  kind: MeetingKind
  parts: { id: number; kind: PartKind }[]
  services: { id: number; role: string }[]
}

/** The role whose holders give a part (and read for it): the congregation's speaker and reader lists. */
export function partRoles(kind: PartKind, meeting: MeetingKind): { speaker: string | null; reader: string | null } {
  switch (kind) {
    case 'chairman':
      return { speaker: meeting === 'midweek' ? 'president-vcm' : 'president-dp-tg', reader: null }
    case 'prayer':
      return { speaker: 'prieres-publiques', reader: null }
    case 'joyaux':
      return { speaker: 'joyaux', reader: null }
    case 'bible-reading':
      return { speaker: 'brother', reader: null }
    case 'perles':
      return { speaker: 'perles', reader: null }
    case 'vcm':
      return { speaker: 'vcm', reader: null }
    case 'cbs':
      return { speaker: 'eba', reader: 'lecture-eba-tg' }
    case 'public-talk':
      return { speaker: 'discours-publics', reader: null }
    case 'watchtower':
      return { speaker: 'conducteur-tour-de-garde', reader: 'lecture-eba-tg' }
    default:
      return { speaker: null, reader: null }
  }
}

export interface ExternalSpeakerSeed {
  name: string
  congregationName: string
  phone: string
  phone2: string | null
  email: string | null
  talks: number[]
}

/** Talk outlines run from 1 to 194; a speaker prepares a handful. */
const OUTLINES = 194

export interface AbsenceSeed {
  person: number
  name: string
  start: Date
  end: Date
}

export interface PartSeed {
  templatePart: number
  assignee: number | null
  assistant: number | null
  externalSpeaker: number | null
  topic: string
  /**
   * The kind of a student part, chosen for the week as the template leaves it: the talk or a demonstration. Null for
   * the other parts, which keep their template's.
   */
  preset: PartPresetKey | null
}

export interface MeetingSeed {
  kind: MeetingKind
  start: Date
  end: Date
  status: 'draft' | 'released'
  parts: PartSeed[]
  services: { templateService: number; assignee: number | null }[]
}

/** The student talk, given by a brother alone. */
const SCHOOL_TALK = 'Discours'

const MINISTRY_TOPICS = [
  'Engager la conversation',
  'Entretenir l’intérêt',
  'Faire des disciples',
  'Expliquer ses croyances',
  SCHOOL_TALK,
]

/** A wall-clock time in Paris as an instant, whatever the machine's own zone. */
export function parisTime(day: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number) as [number, number]
  const y = day.getFullYear()
  const m = day.getMonth()
  const d = day.getDate()
  for (const offset of [1, 2]) {
    const candidate = new Date(Date.UTC(y, m, d, hours - offset, minutes))
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: 'Europe/Paris',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(candidate)
    if (Number(parts.find(part => part.type === 'hour')?.value) === hours) return candidate
  }
  return new Date(Date.UTC(y, m, d, hours - 1, minutes))
}

export function generateExternalSpeakers(random: Random): ExternalSpeakerSeed[] {
  // Talks and second phones from a source of their own, so the rest of the congregation keeps its draws.
  const extra = new Random(0x0a7e5)
  return Array.from({ length: MEETINGS.externalSpeakers }, () => {
    const firstname = random.pick(MALE_FIRST_NAMES)
    const lastname = random.pick(LAST_NAMES)
    const talkCount = extra.int(1, 7)
    return {
      name: `${firstname} ${lastname}`,
      congregationName: random.pick(NEARBY_TOWNS),
      phone: `06 ${Array.from({ length: 4 }, () => String(random.int(0, 99)).padStart(2, '0')).join(' ')}`,
      phone2: extra.chance(0.15)
        ? `01 ${Array.from({ length: 4 }, () => String(extra.int(0, 99)).padStart(2, '0')).join(' ')}`
        : null,
      email: random.chance(0.65)
        ? `${firstname.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.orateur@example.org`
        : null,
      talks: [...new Set(Array.from({ length: talkCount }, () => extra.int(1, OUTLINES)))].sort((a, b) => a - b),
    }
  })
}

/** Days away, entered by about six in ten of those with a login: some past, some coming. */
export function generateAbsences(random: Random, people: PersonSeed[], now: Date): AbsenceSeed[] {
  const absences: AbsenceSeed[] = []
  for (const person of people) {
    if (!person.hasAccount || person.leftAt != null || !random.chance(MEETINGS.absenceAccountsRate)) continue
    const count = Math.max(1, random.fromPercentiles(MEETINGS.absencesPerAccount))
    for (let i = 0; i < count; i++) {
      const start = new Date(now.getTime() + random.int(-330, 100) * DAY)
      start.setHours(0, 0, 0, 0)
      const days = Math.max(1, random.fromPercentiles(MEETINGS.absenceDays))
      absences.push({
        person: person.key,
        name: random.pick(ABSENCE_NAMES),
        start,
        end: new Date(start.getTime() + days * DAY - 1),
      })
    }
  }
  return absences
}

interface Context {
  random: Random
  people: PersonSeed[]
  holders: Map<string, number[]>
  absences: AbsenceSeed[]
  /** How many parts each person had so far: the next one goes to whoever had the fewest. */
  load: Map<number, number>
}

function ageOf(person: PersonSeed, at: Date): number {
  return person.birthDate ? (at.getTime() - person.birthDate.getTime()) / YEAR : 40
}

function chooseFrom(ctx: Context, candidates: number[], used: Set<number>, day: Date): number | null {
  const free = candidates.filter(
    key =>
      !used.has(key) &&
      !ctx.absences.some(absence => absence.person === key && absence.start <= day && absence.end >= day),
  )
  if (free.length === 0) return null
  const fewest = Math.min(...free.map(key => ctx.load.get(key) ?? 0))
  const key = ctx.random.pick(free.filter(each => (ctx.load.get(each) ?? 0) === fewest))
  used.add(key)
  ctx.load.set(key, (ctx.load.get(key) ?? 0) + 1)
  return key
}

function students(ctx: Context, day: Date, brothersOnly: boolean): number[] {
  return ctx.people
    .filter(
      person =>
        person.leftAt == null && !person.goesInactive && ageOf(person, day) >= 10 && (!brothersOnly || person.isMale),
    )
    .map(person => person.key)
}

function assignPart(
  ctx: Context,
  kind: PartKind,
  meeting: MeetingKind,
  used: Set<number>,
  day: Date,
  planned: boolean,
): Omit<PartSeed, 'templatePart'> {
  const none = { assignee: null, assistant: null, externalSpeaker: null, topic: '', preset: null }
  if (kind === 'song' || !planned) return none
  if (kind === 'public-talk' && ctx.random.chance(MEETINGS.externalTalkRate)) {
    return {
      ...none,
      externalSpeaker: ctx.random.int(0, MEETINGS.externalSpeakers - 1),
      topic: ctx.random.pick(TALK_TITLES),
    }
  }
  if (kind === 'bible-reading') return { ...none, assignee: chooseFrom(ctx, students(ctx, day, true), used, day) }
  if (kind === 'ministry') {
    const topic = ctx.random.pick(MINISTRY_TOPICS)
    if (topic === SCHOOL_TALK) {
      const assignee = chooseFrom(ctx, students(ctx, day, true), used, day)
      return { ...none, assignee, topic, preset: PartPresetKey.SchoolTalk }
    }
    const assignee = chooseFrom(ctx, students(ctx, day, false), used, day)
    const person = assignee == null ? null : ctx.people[assignee]
    const partners = students(ctx, day, false).filter(key => ctx.people[key]?.isMale === person?.isMale)
    return {
      ...none,
      assignee,
      assistant: chooseFrom(ctx, partners, used, day),
      topic,
      preset: PartPresetKey.SchoolDemonstration,
    }
  }
  const { speaker, reader } = partRoles(kind, meeting)
  const assignee = chooseFrom(ctx, ctx.holders.get(speaker ?? '') ?? [], used, day)
  const assistant = reader ? chooseFrom(ctx, ctx.holders.get(reader) ?? [], used, day) : null
  return { ...none, assignee, assistant, topic: kind === 'public-talk' ? ctx.random.pick(TALK_TITLES) : '' }
}

/**
 * The meetings of the last six months and the next ones, week by week, Thursday evening and Saturday afternoon.
 * Each part goes to a holder of its role (the public talk most often to a visiting speaker), the Bible reading and the
 * student talk to a brother, the demonstrations to publishers with a partner of the same sex; nobody twice in a
 * meeting, nobody on a day they said they were away.
 * The programme is set two months ahead and the services four weeks ahead; public talks are booked further out.
 */
export function generateMeetings(
  random: Random,
  now: Date,
  templates: TemplateSpec[],
  people: PersonSeed[],
  holders: Map<string, number[]>,
  absences: AbsenceSeed[],
): MeetingSeed[] {
  const ctx: Context = { random, people, holders, absences, load: new Map() }
  const meetings: MeetingSeed[] = []
  for (const template of templates) {
    const config = template.kind === 'midweek' ? MEETINGS.midweek : MEETINGS.weekend
    const future = template.kind === 'midweek' ? MEETINGS.midweekFutureWeeks : MEETINGS.weekendFutureWeeks
    const thisWeek = new Date(now)
    thisWeek.setDate(thisWeek.getDate() + ((config.weekDay - thisWeek.getDay() + 7) % 7))
    for (let week = -MEETINGS.pastWeeks; week < future; week++) {
      const day = new Date(thisWeek.getTime() + week * 7 * DAY)
      const used = new Set<number>()
      const programmed = week < MEETINGS.midweekFutureWeeks
      const parts = template.parts.map(part => ({
        templatePart: part.id,
        // Beyond two months only the public talk is booked.
        ...assignPart(ctx, part.kind, template.kind, used, day, programmed || part.kind === 'public-talk'),
      }))
      const services = template.services.map(service => ({
        templateService: service.id,
        assignee:
          week < MEETINGS.servicesPlannedWeeks ? chooseFrom(ctx, holders.get(service.role) ?? [], used, day) : null,
      }))
      meetings.push({
        kind: template.kind,
        start: parisTime(day, config.start),
        end: parisTime(day, config.end),
        status: programmed ? 'released' : 'draft',
        parts,
        services,
      })
    }
  }
  return meetings
}

/**
 * What each template part is, from its preset: the first two midweek talks of the first section are the « Joyaux »
 * and the « Perles », the others the Christian life talks; a part with no preset is a student part, or a song when it
 * has no section.
 */
export function classifyParts(parts: { preset: string | null; section: string }[]): PartKind[] {
  const gemsSection = parts.find(part => part.preset === PartPresetKey.MidweekTalk)?.section
  let gems = 0
  return parts.map(part => {
    switch (part.preset) {
      case PartPresetKey.Chairman:
        return 'chairman'
      case PartPresetKey.Prayer:
        return 'prayer'
      case PartPresetKey.BibleReading:
        return 'bible-reading'
      case PartPresetKey.PublicTalk:
        return 'public-talk'
      case PartPresetKey.WatchtowerStudy:
        return 'watchtower'
      case PartPresetKey.CongregationBibleStudy:
        return 'cbs'
      case PartPresetKey.MidweekTalk:
        if (part.section !== gemsSection) return 'vcm'
        gems++
        return gems === 1 ? 'joyaux' : 'perles'
      default:
        return part.section === '' ? 'song' : 'ministry'
    }
  })
}
