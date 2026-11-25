import type { Congregation, PersonSeed } from './people'
import { CUSTOM_ROLES, type Eligibility } from './profile'
import type { Random } from './random'

const YEAR = 365.25 * 24 * 60 * 60 * 1000

function eligible(person: PersonSeed, eligibility: Eligibility, now: Date): boolean {
  if (person.leftAt != null || person.goesInactive || !person.hasAccount) return false
  const age = person.birthDate ? (now.getTime() - person.birthDate.getTime()) / YEAR : 40
  switch (eligibility) {
    case 'elder':
      return person.isHelder
    case 'appointed':
      return person.isHelder || person.isServant
    case 'brother':
      return person.isMale && person.baptismDate != null && age >= 18
    case 'young-brother':
      return person.isMale && age >= 12
    case 'publisher':
      return person.baptismDate != null && age >= 16
    default: {
      const exhaustive: never = eligibility
      throw new Error(`Unknown eligibility ${String(exhaustive)}`)
    }
  }
}

/**
 * Who holds each of the congregation's own roles, by role key: as many as the real congregation counts, among
 * those who may (an elder, a brother…) and have a login, since a role is held by an account. The single-person
 * posts go to different elders where possible. A role one person holds reads as that person running it, so it goes
 * to a brother whatever the role's eligibility. A role marked `notGroupOverseer` skips the `groupOverseers`.
 */
export function assignRoleHolders(
  random: Random,
  people: PersonSeed[],
  now: Date,
  avoid: number[],
  groupOverseers: number[] = [],
): Map<string, number[]> {
  const holders = new Map<string, number[]>()
  const posted = new Set(avoid)
  const overseers = new Set(groupOverseers)
  for (const role of CUSTOM_ROLES) {
    const shuffled = random.shuffle(people.filter(person => eligible(person, role.eligibility, now)))
    // Filtered after the shuffle, which then takes as many draws as before: the rest of the congregation keeps its.
    const brothers = role.single || role.holders === 1 ? shuffled.filter(person => person.isMale) : shuffled
    const pool = role.notGroupOverseer ? brothers.filter(person => !overseers.has(person.key)) : brothers
    // One person runs it, as a single post: someone without another post while anyone is left (a demo login signs in
    // as its holder, and two roles on one login would read as one).
    if (role.single || role.holders === 1) {
      const holder = pool.find(person => !posted.has(person.key)) ?? pool[0]
      if (holder) {
        posted.add(holder.key)
        holders.set(role.key, [holder.key])
      }
      continue
    }
    holders.set(
      role.key,
      pool.slice(0, role.holders).map(person => person.key),
    )
  }
  return holders
}

/** Who each demo role signs in as, but the publisher (chosen from the database, among those holding no role). */
export type DemoRolePersons = Record<
  'coordinator' | 'secretary' | 'programmes' | 'territories' | 'group-overseer',
  number | undefined
>

/**
 * The persons the committee's demo roles sign in as: the coordinator and the secretary, the elder in charge of the
 * midweek meeting, the territory servant, and a group overseer who holds none of those roles. The banner names a
 * visitor's role from their login: each must be someone else.
 */
export function demoRolePersons(people: Congregation, holders: Map<string, number[]>): DemoRolePersons {
  const programmes = holders.get('responsable-vcm')?.[0]
  const territories = holders.get('territoires')?.[0]
  // Elders with another role often lead a group too: the first group led by none of them, so each role is its own login.
  const taken = new Set([people.admin, people.secretary, people.serviceOverseer, programmes, territories])
  const overseer = people.groups.find(group => !taken.has(group.responsible))?.responsible
  return { coordinator: people.admin, secretary: people.secretary, programmes, territories, 'group-overseer': overseer }
}
