import { FEMALE_FIRST_NAMES, LAST_NAMES, MALE_FIRST_NAMES, RELATIONSHIPS } from './names'
import { GROUPS, PEOPLE } from './profile'
import type { Random } from './random'

const DAY = 24 * 60 * 60 * 1000
const YEAR = 365.25 * DAY

export interface EmergencyContactSeed {
  name: string
  relationship: string
  phone: string
}

export interface PersonSeed {
  /** Index in the generated list: what every other generator refers to. */
  key: number
  firstname: string
  lastname: string
  isMale: boolean
  birthDate: Date | null
  baptismDate: Date | null
  household: number
  phone: string
  email: string
  address: string
  isHelder: boolean
  isServant: boolean
  isAnointed: boolean
  dpaCardUpToDate: boolean
  survivalBackpackReady: boolean
  /** Index in `groups`; null for those who left. */
  group: number | null
  createdAt: Date
  arrivedAt: Date | null
  lastPastoralVisitAt: Date | null
  leftAt: Date | null
  anonymized: boolean
  /** Becomes inactive through six reports without ministry (the history writes them). */
  goesInactive: boolean
  hasAccount: boolean
  verified: boolean
  emergencyContacts: EmergencyContactSeed[]
}

export interface GroupSeed {
  name: string
  address: string
  responsible: number
  deputy: number | null
}

export interface Congregation {
  people: PersonSeed[]
  groups: GroupSeed[]
  /** The demo login's person: Marc DUPONT, elder, coordinator. */
  admin: number
  /** Roles of the service committee, by person. */
  coordinator: number
  secretary: number
  serviceOverseer: number
}

interface Member {
  isMale: boolean
  age: number
  child: boolean
}

/** The households, by composition: alone, a couple, a parent with a child, or a couple with children. */
function householdShapes(random: Random): Member[][] {
  const sizes: number[] = []
  for (const [size, count] of Object.entries(PEOPLE.householdSizes)) {
    for (let i = 0; i < count; i++) sizes.push(Number(size))
  }
  const shapes = random.shuffle(sizes).map(size => {
    if (size === 1) return [{ isMale: false, age: 0, child: false }]
    if (size === 2 && random.chance(0.25)) {
      return [
        { isMale: false, age: 0, child: false },
        { isMale: random.chance(0.5), age: 0, child: true },
      ]
    }
    const members: Member[] = [
      { isMale: true, age: 0, child: false },
      { isMale: false, age: 0, child: false },
    ]
    for (let i = 2; i < size; i++) members.push({ isMale: random.chance(0.5), age: 0, child: true })
    return members
  })

  // The brothers not in a couple or among the children live alone, until the count is right.
  const brothers = shapes.flat().filter(member => member.isMale).length
  const singles = random.shuffle(shapes.filter(shape => shape.length === 1))
  for (let i = 0; i < PEOPLE.brothers - brothers && i < singles.length; i++) (singles[i]?.[0] as Member).isMale = true
  return shapes
}

const BANDS: Record<string, [number, number]> = {
  '8-12': [8, 12],
  '13-17': [13, 17],
  '18-29': [18, 29],
  '30-49': [30, 49],
  '50-69': [50, 69],
  '70-90': [70, 90],
}

function adultAge(random: Random): number {
  const adultBands = Object.fromEntries(
    Object.entries(PEOPLE.ageBands).filter(([band]) => !band.startsWith('8') && !band.startsWith('13')),
  )
  const [min, max] = BANDS[random.weighted(adultBands)] as [number, number]
  return random.int(min, max)
}

/** Ages that hold together: a couple of similar age, children 24 to 38 years younger than their mother. */
function giveAges(random: Random, shapes: Member[][]) {
  for (const shape of shapes) {
    const adults = shape.filter(member => !member.child)
    const children = shape.filter(member => member.child)
    const first = adults[0] as Member
    first.age = children.length > 0 ? random.int(34, 58) : adultAge(random)
    for (const partner of adults.slice(1)) partner.age = Math.max(19, first.age + random.int(-5, 3))
    for (const child of children) child.age = Math.max(8, first.age - random.int(24, 38))
  }
}

function dateYearsAgo(now: Date, years: number, random: Random): Date {
  return new Date(now.getTime() - years * YEAR - random.int(0, 364) * DAY)
}

/** Baptised at an age drawn from the real distribution, never in the future nor before ten. */
function baptism(random: Random, birthDate: Date, age: number, now: Date): Date | null {
  if (age < 13) return null
  const at = age < 18 ? random.int(13, age) : Math.min(age, Math.max(10, random.fromPercentiles(PEOPLE.baptismAge)))
  const date = new Date(birthDate.getTime() + at * YEAR + random.int(0, 300) * DAY)
  return date.getTime() < now.getTime() - 30 * DAY ? date : null
}

function phoneNumber(random: Random): string {
  const pairs = Array.from({ length: 4 }, () => String(random.int(0, 99)).padStart(2, '0'))
  return `0${random.pick(['6', '7'])} ${pairs.join(' ')}`
}

function emailOf(firstname: string, lastname: string, taken: Set<string>): string {
  const slug = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z]+/g, '')
  const base = `${slug(firstname)}.${slug(lastname)}`
  let email = `${base}@demo.unitae.app`
  for (let n = 2; taken.has(email); n++) email = `${base}${n}@demo.unitae.app`
  taken.add(email)
  return email
}

/** People of the demo congregation, their households, groups and appointments. */
export function generateCongregation(random: Random, now: Date, addresses: readonly string[]): Congregation {
  const shapes = householdShapes(random)
  giveAges(random, shapes)

  // The demo login's family comes first so its name is reserved before any other household is named.
  const lastnames = random.shuffle(LAST_NAMES.filter(name => name !== 'Dupont'))
  const firstnamesTaken = new Set<string>()
  const emails = new Set<string>()
  const people: PersonSeed[] = []
  const adminShape = shapes.findIndex(shape => shape.length === 2 && shape.every(member => !member.child))
  // The demo login is an elder of some experience, married to a sister of his age.
  for (const [index, member] of (shapes[adminShape] ?? []).entries()) member.age = 52 - index * 2

  shapes.forEach((shape, household) => {
    const lastname = household === adminShape ? 'Dupont' : (lastnames[household % lastnames.length] as string)
    const address = `${random.int(1, 140)} ${random.pick(addresses)}`
    for (const member of shape) {
      const pool = member.isMale ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES
      let firstname = household === adminShape && member.isMale ? 'Marc' : random.pick(pool)
      while (firstnamesTaken.has(`${firstname} ${lastname}`)) firstname = random.pick(pool)
      firstnamesTaken.add(`${firstname} ${lastname}`)
      const birthDate = dateYearsAgo(now, member.age, random)
      const young = member.age < 16
      people.push({
        key: people.length,
        firstname,
        lastname,
        isMale: member.isMale,
        birthDate,
        baptismDate: baptism(random, birthDate, member.age, now),
        household,
        phone: young ? '' : phoneNumber(random),
        email: young ? '' : emailOf(firstname, lastname, emails),
        address,
        isHelder: false,
        isServant: false,
        isAnointed: false,
        dpaCardUpToDate: false,
        survivalBackpackReady: false,
        group: null,
        createdAt: new Date(now.getTime() - random.int(36, 84) * 30 * DAY),
        arrivedAt: null,
        lastPastoralVisitAt: null,
        leftAt: null,
        anonymized: false,
        goesInactive: false,
        hasAccount: false,
        verified: false,
        emergencyContacts: [],
      })
    }
  })

  appoint(random, people, now)
  const admin = people.find(person => person.firstname === 'Marc' && person.lastname === 'Dupont') as PersonSeed
  const committee = committeeOf(people, admin)
  const groups = formGroups(random, people, addresses, committee)
  fillDetails(random, people, now)
  // Former publishers come after the active ones, so the keys the groups and committee hold stay valid.
  const former = formerPublishers(random, now, emails, lastnames)
  return { people: numberPeople([...people, ...former]), groups, admin: admin.key, ...committee }
}

function age(person: PersonSeed, now: Date): number {
  return person.birthDate ? (now.getTime() - person.birthDate.getTime()) / YEAR : 40
}

/** Elders and servants: baptised brothers, elders from 35, servants from 20; the demo login is an elder. */
function appoint(random: Random, people: PersonSeed[], now: Date) {
  const brothers = people.filter(person => person.isMale && person.baptismDate != null)
  const admin = people.find(person => person.firstname === 'Marc' && person.lastname === 'Dupont') as PersonSeed
  if (admin.baptismDate == null && admin.birthDate) {
    admin.baptismDate = new Date(admin.birthDate.getTime() + 19 * YEAR)
  }
  admin.isHelder = true
  const elders = random.shuffle(brothers.filter(person => person !== admin && age(person, now) >= 35))
  for (const elder of elders.slice(0, PEOPLE.elders - 1)) elder.isHelder = true
  const servants = random.shuffle(brothers.filter(person => !person.isHelder && age(person, now) >= 20))
  for (const servant of servants.slice(0, PEOPLE.servants)) servant.isServant = true
  const anointed = people.filter(person => person.baptismDate != null && age(person, now) >= 65)
  if (anointed.length > 0) random.pick(anointed).isAnointed = true
}

function committeeOf(people: PersonSeed[], admin: PersonSeed) {
  const elders = people.filter(person => person.isHelder && person !== admin)
  return {
    coordinator: admin.key,
    secretary: (elders[0] as PersonSeed).key,
    serviceOverseer: (elders[1] as PersonSeed).key,
  }
}

/**
 * Five groups of about the same size. Each overseer is an elder and each assistant a servant (an elder when there
 * are too few), and both belong to the group they lead, with their household; families are never split.
 */
function formGroups(
  random: Random,
  people: PersonSeed[],
  addresses: readonly string[],
  committee: { coordinator: number; secretary: number; serviceOverseer: number },
): GroupSeed[] {
  // The secretary and the service overseer usually lead no group; the coordinator often does.
  const busy = new Set([committee.secretary, committee.serviceOverseer])
  const elders = people.filter(person => person.isHelder)
  const overseers = [
    ...elders.filter(person => !busy.has(person.key)),
    ...elders.filter(person => busy.has(person.key)),
  ]
  const servants = random.shuffle(people.filter(person => person.isServant))
  const groups: GroupSeed[] = []
  const usedHouseholds = new Set<number>()

  for (const [index, name] of GROUPS.entries()) {
    const responsible = overseers.find(person => !usedHouseholds.has(person.household)) as PersonSeed
    usedHouseholds.add(responsible.household)
    const deputy =
      servants.find(person => !usedHouseholds.has(person.household)) ??
      overseers.find(person => !usedHouseholds.has(person.household))
    if (deputy) usedHouseholds.add(deputy.household)
    groups.push({
      name: `Groupe ${name}`,
      address: `${random.int(1, 80)} ${random.pick(addresses)}`,
      responsible: responsible.key,
      deputy: deputy?.key ?? null,
    })
    for (const person of people) {
      if (person.household === responsible.household || person.household === deputy?.household) person.group = index
    }
  }

  // The other households fill the smallest group, largest households first.
  const households = new Map<number, PersonSeed[]>()
  for (const person of people) {
    if (person.group != null) continue
    households.set(person.household, [...(households.get(person.household) ?? []), person])
  }
  const sizes = groups.map((_, index) => people.filter(person => person.group === index).length)
  for (const members of random.shuffle([...households.values()]).sort((a, b) => b.length - a.length)) {
    const smallest = sizes.indexOf(Math.min(...sizes))
    for (const person of members) person.group = smallest
    sizes[smallest] = (sizes[smallest] as number) + members.length
  }
  return groups
}

/** What only some publishers have: an arrival date, a visit, emergency information, a login. */
function fillDetails(random: Random, people: PersonSeed[], now: Date) {
  const adults = people.filter(person => age(person, now) >= 18)
  // Elders and servants keep their email and phone: they need a login, and are reached first.
  const unappointed = adults.filter(person => !person.isHelder && !person.isServant)
  for (const person of random.shuffle(adults).slice(0, PEOPLE.withoutBirthDate)) person.birthDate = null
  for (const person of random.shuffle(unappointed).slice(0, PEOPLE.withoutPhone)) person.phone = ''
  for (const person of random.shuffle(unappointed.filter(each => age(each, now) >= 70)).slice(0, PEOPLE.withoutEmail)) {
    person.email = ''
  }
  // A few baptised as adults are still to be: new publishers.
  const recent = random.shuffle(adults.filter(person => !person.isHelder && !person.isServant && !person.isAnointed))
  for (const person of recent.slice(0, PEOPLE.unbaptizedAdults)) person.baptismDate = null

  for (const person of random.shuffle(adults).slice(0, PEOPLE.recentArrivals)) {
    person.arrivedAt = new Date(now.getTime() - random.int(30, 420) * DAY)
    person.createdAt = person.arrivedAt
  }
  for (const person of random.shuffle(adults).slice(0, PEOPLE.pastoralVisits)) {
    person.lastPastoralVisitAt = new Date(now.getTime() - random.int(10, 340) * DAY)
  }
  for (const person of random.shuffle(adults).slice(0, PEOPLE.dpaCardUpToDate)) person.dpaCardUpToDate = true
  for (const person of random.shuffle(adults).slice(0, PEOPLE.survivalBackpackReady))
    person.survivalBackpackReady = true

  const withContacts = random.shuffle(adults).slice(
    0,
    Object.values(PEOPLE.emergencyContacts).reduce((a, b) => a + b, 0),
  )
  for (const person of withContacts) {
    const count = random.weighted(PEOPLE.emergencyContacts)
    person.emergencyContacts = Array.from({ length: count }, () => ({
      name: `${random.pick([...MALE_FIRST_NAMES, ...FEMALE_FIRST_NAMES])} ${random.pick(LAST_NAMES)}`,
      relationship: random.pick(RELATIONSHIPS),
      phone: phoneNumber(random),
    }))
  }

  const ordinary = people.filter(person => !person.isHelder && !person.isServant && age(person, now) >= 25)
  for (const person of random.shuffle(ordinary).slice(0, PEOPLE.inactive)) person.goesInactive = true

  for (const person of people) {
    if (person.email === '') continue
    person.hasAccount = person.isHelder || person.isServant || random.chance(PEOPLE.withAccount)
    person.verified = person.hasAccount && (person.isHelder || random.chance(PEOPLE.verified))
  }
}

/**
 * Those who left in the last two years. The app anonymises a former publisher six months after they left, so only
 * the recent ones keep a name; none is in a group any more.
 */
function formerPublishers(random: Random, now: Date, emails: Set<string>, lastnames: readonly string[]): PersonSeed[] {
  return Array.from({ length: PEOPLE.left }, (_, index): PersonSeed => {
    const anonymized = index < PEOPLE.anonymized
    const leftAt = new Date(now.getTime() - (anonymized ? random.int(190, 720) : random.int(7, 170)) * DAY)
    const isMale = random.chance(0.35)
    const firstname = random.pick(isMale ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES)
    const lastname = random.pick(lastnames.slice(-40))
    const years = random.int(20, 80)
    const birthDate = dateYearsAgo(now, years, random)
    return {
      key: -1,
      firstname: anonymized ? 'Utilisateur' : firstname,
      lastname: anonymized ? 'supprime' : lastname,
      isMale,
      birthDate: anonymized ? null : birthDate,
      baptismDate: anonymized ? null : new Date(birthDate.getTime() + Math.min(random.int(15, 30), years - 2) * YEAR),
      household: -1,
      phone: anonymized ? '' : phoneNumber(random),
      email: anonymized ? '' : emailOf(firstname, lastname, emails),
      address: '',
      isHelder: false,
      isServant: false,
      isAnointed: false,
      dpaCardUpToDate: false,
      survivalBackpackReady: false,
      group: null,
      createdAt: new Date(leftAt.getTime() - random.int(24, 72) * 30 * DAY),
      arrivedAt: null,
      lastPastoralVisitAt: null,
      leftAt,
      anonymized,
      goesInactive: false,
      hasAccount: false,
      verified: false,
      emergencyContacts: [],
    }
  })
}

/** Gives every person its index, once the active and former lists are joined. */
export function numberPeople(people: PersonSeed[]): PersonSeed[] {
  return people.map((person, key) => ({ ...person, key }))
}
