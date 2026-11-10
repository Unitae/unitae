import { describe, expect, it } from 'vitest'

import { generateAttributions, generatePioneers, generateReports } from './history'
import { classifyParts, generateAbsences, generateMeetings, type TemplateSpec } from './meetings'
import { generateCongregation } from './people'
import { generateArea } from './places'
import { PEOPLE, TERRITORIES } from './profile'
import { Random } from './random'
import { assignRoleHolders } from './roles'

const NOW = new Date(2026, 10, 10, 12)
const YEAR = 365.25 * 24 * 60 * 60 * 1000
const ordinal = (date: Date) => date.getFullYear() * 12 + date.getMonth()

function build(seed = 7) {
  const random = new Random(seed)
  const area = generateArea(random, NOW)
  const congregation = generateCongregation(random, NOW, area.addresses)
  const stints = generatePioneers(random, congregation.people, NOW)
  const { reports, inactiveAt } = generateReports(random, congregation.people, stints, NOW)
  const attributions = generateAttributions(random, area.territories, congregation.people, stints, NOW)
  return { random, area, ...congregation, stints, reports, inactiveAt, attributions }
}

const demo = build()
const active = demo.people.filter(person => person.leftAt == null)

describe('the demo congregation', () => {
  it('is as large as the real one, with as many brothers, elders and servants', () => {
    expect(active).toHaveLength(PEOPLE.active)
    expect(active.filter(person => person.isMale)).toHaveLength(PEOPLE.brothers)
    expect(active.filter(person => person.isHelder)).toHaveLength(PEOPLE.elders)
    expect(active.filter(person => person.isServant)).toHaveLength(PEOPLE.servants)
    expect(demo.people.filter(person => person.leftAt != null)).toHaveLength(PEOPLE.left)
  })

  it('keeps the demo login: Marc DUPONT, an elder who coordinates', () => {
    const marc = demo.people[demo.admin]
    expect(marc).toMatchObject({
      firstname: 'Marc',
      lastname: 'Dupont',
      isMale: true,
      isHelder: true,
      hasAccount: true,
    })
    expect(demo.coordinator).toBe(demo.admin)
    expect(demo.people.filter(person => person.firstname === 'Marc' && person.lastname === 'Dupont')).toHaveLength(1)
  })

  it('appoints only baptised adult brothers', () => {
    for (const person of active.filter(each => each.isHelder || each.isServant)) {
      expect(person.isMale).toBe(true)
      expect(person.baptismDate).not.toBeNull()
      if (person.birthDate) expect((NOW.getTime() - person.birthDate.getTime()) / YEAR).toBeGreaterThanOrEqual(20)
    }
  })

  it('baptises after ten years of age and never in the future', () => {
    for (const person of demo.people) {
      if (!person.baptismDate) continue
      expect(person.baptismDate.getTime()).toBeLessThan(NOW.getTime())
      if (person.birthDate) {
        expect(person.baptismDate.getTime() - person.birthDate.getTime()).toBeGreaterThanOrEqual(10 * YEAR)
      }
    }
  })

  // The groups list's rule: an overseer and his assistant are in the group they lead.
  it('puts every overseer and assistant in the group he leads, elders and servants only', () => {
    demo.groups.forEach((group, index) => {
      const responsible = demo.people[group.responsible]
      expect(responsible?.isHelder).toBe(true)
      expect(responsible?.group).toBe(index)
      if (group.deputy != null) {
        const deputy = demo.people[group.deputy]
        expect(deputy?.isHelder || deputy?.isServant).toBe(true)
        expect(deputy?.group).toBe(index)
      }
    })
  })

  it('keeps each household in one group, at one address, and every active publisher in a group', () => {
    const households = new Map<number, Set<string>>()
    for (const person of active) {
      expect(person.group).not.toBeNull()
      const seen = households.get(person.household) ?? new Set<string>()
      seen.add(`${person.group}|${person.address}|${person.lastname}`)
      households.set(person.household, seen)
    }
    for (const seen of households.values()) expect(seen.size).toBe(1)
  })

  it('makes groups of about the same size', () => {
    const sizes = demo.groups.map((_, index) => active.filter(person => person.group === index).length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(4)
  })

  // Anonymised six months after leaving, as the app does: no name, no contact, no group.
  it('anonymises only those who left more than six months ago', () => {
    for (const person of demo.people.filter(each => each.leftAt != null)) {
      const months = (NOW.getTime() - (person.leftAt as Date).getTime()) / (30 * 24 * 60 * 60 * 1000)
      expect(person.anonymized).toBe(months > 6)
      expect(person.group).toBeNull()
      if (person.anonymized) expect(person).toMatchObject({ phone: '', email: '', birthDate: null })
    }
  })

  it('writes the same congregation for the same seed and day', () => {
    const again = build()
    expect(again.people.map(person => `${person.firstname} ${person.lastname}`)).toEqual(
      demo.people.map(person => `${person.firstname} ${person.lastname}`),
    )
  })
})

describe('the demo territory', () => {
  it('has as many door-to-door and shop territories as the real one', () => {
    expect(demo.area.territories.filter(territory => territory.type === 'Classical')).toHaveLength(
      TERRITORIES.classical,
    )
    expect(demo.area.territories.filter(territory => territory.type === 'Commerces')).toHaveLength(
      TERRITORIES.commerces,
    )
  })

  it('numbers the territories as the app suggests: D001…, C001…', () => {
    expect(demo.area.territories[0]?.number).toBe('C001')
    expect(demo.area.territories.find(territory => territory.type === 'Classical')?.number).toBe('D001')
  })

  it('cuts each territory from consecutive buildings of one street, shops for shop territories', () => {
    for (const territory of demo.area.territories) {
      const buildings = territory.buildings.map(key => demo.area.buildings[key])
      expect(new Set(buildings.map(building => building?.street)).size).toBe(1)
      for (const building of buildings) {
        expect(building?.inTerritory).toBe(true)
        expect(building?.entrance.kind).toBe(territory.type === 'Commerces' ? 'Commerce' : 'Residential')
      }
    }
  })

  it('gives every building its own address, and leaves free entrances for « Créer en lot »', () => {
    const addresses = demo.area.buildings.map(building => `${building.number}|${building.street}|${building.zip}`)
    expect(new Set(addresses).size).toBe(addresses.length)
    expect(demo.area.buildings.filter(building => !building.inTerritory).length).toBeGreaterThan(500)
  })

  it('draws a closed perimeter around every building', () => {
    const [first, ...rest] = demo.area.perimeter
    expect(rest.at(-1)).toEqual(first)
    for (const building of demo.area.buildings) {
      expect(building.latitude).toBeLessThan(Math.max(...demo.area.perimeter.map(point => point.lat)))
      expect(building.longitude).toBeGreaterThan(Math.min(...demo.area.perimeter.map(point => point.lng)))
    }
  })
})

describe('the demo history', () => {
  it('has the real number of regular pioneers serving today', () => {
    const serving = demo.stints.filter(stint => stint.type === 'PionnierPermanant' && stint.end == null)
    expect(serving).toHaveLength(PEOPLE.regularPioneers)
    for (const stint of serving) expect(demo.people[stint.person]?.baptismDate).not.toBeNull()
  })

  it('files reports only between arrival and departure, never for the month under way', () => {
    for (const report of demo.reports) {
      const person = demo.people[report.person]
      const month = report.year * 12 + report.month
      expect(month).toBeLessThan(ordinal(NOW))
      expect(month).toBeGreaterThanOrEqual(ordinal(person?.createdAt as Date))
      if (person?.leftAt) expect(month).toBeLessThan(ordinal(person.leftAt))
    }
  })

  // The report's type must match the enrolment covering its month, as backfillCongregationEnrolments assumes.
  it('reports as a pioneer only in a month covered by that service; publishers give no hours', () => {
    for (const report of demo.reports) {
      const month = report.year * 12 + report.month
      const stint = demo.stints.find(
        each =>
          each.person === report.person &&
          each.start.year * 12 + each.start.month <= month &&
          (each.end == null || each.end.year * 12 + each.end.month >= month),
      )
      if (report.type === 'Normal') expect(report.hours).toBe(0)
      else expect(stint?.type).toBe(report.type)
    }
  })

  it('makes the two inactive publishers end with six reports or more without ministry, inactive since then', () => {
    expect(demo.inactiveAt.size).toBe(PEOPLE.inactive)
    for (const [person, since] of demo.inactiveAt) {
      const own = demo.reports
        .filter(report => report.person === person)
        .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))
      expect(own.slice(0, 6).every(report => !report.isPublisher)).toBe(true)
      expect(since.getTime()).toBeLessThan(NOW.getTime())
    }
  })

  it('never gives a territory to two publishers at once, and keeps about four in ten out', () => {
    const byTerritory = new Map<number, typeof demo.attributions>()
    for (const attribution of demo.attributions) {
      byTerritory.set(attribution.territory, [...(byTerritory.get(attribution.territory) ?? []), attribution])
    }
    for (const list of byTerritory.values()) {
      const sorted = [...list].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      for (const [i, attribution] of sorted.entries()) {
        const previous = sorted[i - 1]
        if (previous) expect(previous.endDate?.getTime()).toBeLessThanOrEqual(attribution.startDate.getTime())
      }
    }
    const open = demo.attributions.filter(attribution => attribution.endDate == null).length
    expect(open / demo.area.territories.length).toBeCloseTo(0.42, 1)
  })

  // The app rests a door-to-door territory 90 days once returned: it cannot go out again before.
  it('lets each territory rest 90 days between attributions, and leaves most of the others free today', () => {
    const DAY = 24 * 60 * 60 * 1000
    const byTerritory = new Map<number, typeof demo.attributions>()
    for (const attribution of demo.attributions) {
      byTerritory.set(attribution.territory, [...(byTerritory.get(attribution.territory) ?? []), attribution])
    }
    let free = 0
    for (const list of byTerritory.values()) {
      const sorted = [...list].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      for (const [i, attribution] of sorted.entries()) {
        const previous = sorted[i - 1]
        if (previous?.endDate)
          expect(attribution.startDate.getTime() - previous.endDate.getTime()).toBeGreaterThanOrEqual(90 * DAY)
      }
      const last = sorted.at(-1)
      if (last?.endDate && NOW.getTime() - last.endDate.getTime() >= 90 * DAY) free++
    }
    const notOut =
      demo.area.territories.length - demo.attributions.filter(attribution => attribution.endDate == null).length
    expect(free / notOut).toBeGreaterThan(0.5)
  })
})

describe('the demo meetings', () => {
  const holders = assignRoleHolders(demo.random, demo.people, NOW, [demo.admin])
  const absences = generateAbsences(demo.random, demo.people, NOW)
  const templates: TemplateSpec[] = [
    {
      kind: 'midweek',
      parts: [
        { id: 1, kind: 'chairman' },
        { id: 2, kind: 'prayer' },
        { id: 3, kind: 'joyaux' },
        { id: 4, kind: 'bible-reading' },
        { id: 5, kind: 'ministry' },
        { id: 6, kind: 'ministry' },
        { id: 7, kind: 'cbs' },
        { id: 8, kind: 'song' },
      ],
      services: [
        { id: 1, role: 'sono' },
        { id: 2, role: 'micros' },
        { id: 3, role: 'micros' },
      ],
    },
    {
      kind: 'weekend',
      parts: [
        { id: 9, kind: 'chairman' },
        { id: 10, kind: 'public-talk' },
        { id: 11, kind: 'watchtower' },
      ],
      services: [{ id: 4, role: 'accueil-porte' }],
    },
  ]
  const meetings = generateMeetings(demo.random, NOW, templates, demo.people, holders, absences)

  it('never gives two parts or services of one meeting to the same person', () => {
    for (const meeting of meetings) {
      const people = [
        ...meeting.parts.flatMap(part => [part.assignee, part.assistant]),
        ...meeting.services.map(service => service.assignee),
      ].filter(key => key != null)
      expect(new Set(people).size).toBe(people.length)
    }
  })

  it('gives each part to a holder of its role, the student parts to two publishers of the same sex', () => {
    for (const meeting of meetings) {
      for (const part of meeting.parts) {
        if (part.templatePart === 10 && part.externalSpeaker == null && part.assignee != null) {
          expect(holders.get('discours-publics')).toContain(part.assignee)
        }
        if ((part.templatePart === 5 || part.templatePart === 6) && part.assignee != null && part.assistant != null) {
          expect(demo.people[part.assignee]?.isMale).toBe(demo.people[part.assistant]?.isMale)
        }
        if (part.templatePart === 4 && part.assignee != null) expect(demo.people[part.assignee]?.isMale).toBe(true)
        if (part.templatePart === 8) expect(part.assignee).toBeNull()
      }
    }
  })

  it('assigns nobody on a day they said they were away', () => {
    for (const meeting of meetings) {
      const day = new Date(meeting.start)
      day.setHours(12)
      for (const key of meeting.parts.flatMap(part => [part.assignee, part.assistant]).filter(each => each != null)) {
        expect(absences.some(absence => absence.person === key && absence.start <= day && absence.end >= day)).toBe(
          false,
        )
      }
    }
  })

  it('meets on Thursday evening and Saturday afternoon, with services set only a few weeks ahead', () => {
    for (const meeting of meetings) {
      expect(meeting.start.getDay()).toBe(meeting.kind === 'midweek' ? 4 : 6)
      if (meeting.start.getTime() - NOW.getTime() > 5 * 7 * 24 * 60 * 60 * 1000) {
        expect(meeting.services.every(service => service.assignee == null)).toBe(true)
      }
    }
  })
})

describe('classifyParts', () => {
  // The default midweek template, as seedDefaultTemplates writes it, with the chairman part the demo adds.
  it('tells the Joyaux, the Perles and the Christian life talks apart, and the songs from the student parts', () => {
    const gems = 'Joyaux de la Parole de Dieu'
    const ministry = 'Applique-toi au ministère'
    const life = 'Vie chrétienne'
    expect(
      classifyParts([
        { preset: 'chairman', section: '' },
        { preset: 'prayer', section: '' },
        { preset: 'midweek-talk', section: gems },
        { preset: 'midweek-talk', section: gems },
        { preset: 'bible-reading', section: gems },
        { preset: null, section: ministry },
        { preset: null, section: '' },
        { preset: 'midweek-talk', section: life },
        { preset: 'congregation-bible-study', section: life },
      ]),
    ).toEqual(['chairman', 'prayer', 'joyaux', 'perles', 'bible-reading', 'ministry', 'song', 'vcm', 'cbs'])
  })
})
