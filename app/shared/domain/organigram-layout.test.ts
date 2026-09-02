import { describe, expect, it } from 'vitest'
import { SERVICE_COMMITTEE_KEY, SERVICE_COMMITTEE_POST_KEYS } from '~/shared/domain/built-in-roles.server'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import { bandAdjoints, groupLayout, responsibilityEyebrow, seatLabel, teamRows, toLayout } from './organigram-layout'

// The printed "Organisation des services" sheet has no connector lines and no deep indentation.
// It groups children under band headers — « Sous la responsabilité du secrétaire » — and prints
// everything else as a row. These rules were read off that sheet; none of them is stored.

let id = 1
function node(over: Partial<OrganigramNode> = {}): OrganigramNode {
  return {
    id: id++,
    key: `n${id}`,
    name: `N${id}`,
    note: null,
    isRoster: false,
    isSinglePerson: false,
    holders: [],
    children: [],
    ...over,
  }
}

/** The standard chart, as the sheet expects it. */
function standardTree() {
  const accueil = node({ name: 'Service Accueil' })
  const reunion = node({ name: 'Programme Réunion Publique' })
  const coordinator = node({
    name: 'Coordinateur',
    key: 'coordinator',
    isSinglePerson: true,
    children: [accueil, reunion],
  })
  const compte = node({ name: 'Compte' })
  const secretary = node({ name: 'Secrétaire', key: 'secretary', isSinglePerson: true, children: [compte] })
  const overseer = node({ name: 'Surveillant du service', key: 'service-overseer', isSinglePerson: true })
  const committee = node({
    name: 'Comité de service',
    key: 'service-committee',
    // Deliberately out of canonical order, to prove the layout reorders them.
    children: [secretary, coordinator, overseer],
  })
  const nettoyage = node({ name: 'Coordinateur Nettoyage', isSinglePerson: true })
  const elders = node({ name: 'Anciens', key: 'elder', isRoster: true, children: [committee, nettoyage] })
  const assistants = node({ name: 'Assistants', key: 'assistant-servant', isRoster: true })
  return { elders, assistants, committee, coordinator, secretary, overseer, accueil, reunion, compte, nettoyage }
}

describe('toLayout — the sheet order', () => {
  it('prints rosters, then the committee, then each post’s branch, then the college’s own services', () => {
    const t = standardTree()

    const blocks = toLayout([t.elders, t.assistants])

    // Both rosters lead — the assistants no longer sink below the whole elder branch.
    expect(blocks[0]).toMatchObject({ kind: 'roster', id: t.elders.id })
    expect(blocks[1]).toMatchObject({ kind: 'roster', id: t.assistants.id })
    expect(blocks[2]).toMatchObject({ kind: 'committee', id: t.committee.id })

    // Then the branches, in post order, and the college's own services close the sheet —
    // « sous la responsabilité du Collège des anciens », not of a roster called « Anciens ».
    const unders = blocks.flatMap(b => (b.kind === 'band' ? [b.under] : []))
    expect(unders).toEqual(['Coordinateur', 'Secrétaire', 'Collège des anciens'])
  })

  it('composes the committee of its posts, in canonical order, never « sous la responsabilité »', () => {
    const t = standardTree()

    const blocks = toLayout([t.elders, t.assistants])

    const committee = blocks.find(b => b.kind === 'committee')
    expect(committee?.kind === 'committee' && committee.posts.map(p => p.id)).toEqual([
      t.coordinator.id,
      t.secretary.id,
      t.overseer.id,
    ])
    // The coordinator is part of the committee, not under it: no band ever claims otherwise.
    expect(blocks.some(b => b.kind === 'band' && b.under === 'Comité de service')).toBe(false)
  })

  it('groups a post’s direct services under the post, leaves included', () => {
    const t = standardTree()

    const blocks = toLayout([t.elders, t.assistants])

    // « Programme Réunion Publique » has no team, but it still belongs visibly to the
    // coordinator — a bare row would leave it answering to nobody.
    const collector = blocks.find(b => b.kind === 'band' && b.node == null && b.under === 'Coordinateur')
    expect(collector?.kind === 'band' && collector.rows.map(r => r.id)).toEqual([t.accueil.id, t.reunion.id])
  })

  it('keeps a service and its teams as one band', () => {
    const estrade = node({ name: 'Equipe Estrade' })
    const audio = node({ name: 'Audio/Vidéo', children: [estrade] })
    const coordinator = node({ name: 'Coordinateur', key: 'coordinator', isSinglePerson: true, children: [audio] })
    const committee = node({ name: 'Comité', key: 'service-committee', children: [coordinator] })
    const elders = node({ name: 'Anciens', key: 'elder', isRoster: true, children: [committee] })

    const blocks = toLayout([elders])

    const band = blocks.find(b => b.kind === 'band' && b.node?.id === audio.id)
    expect(band?.kind === 'band' && band.rows.map(r => r.id)).toEqual([estrade.id])
    expect(band?.kind === 'band' && band.under).toBe('Coordinateur')
  })

  it('does not indent past the band — deeper containers become sibling bands', () => {
    const deep = node({ name: 'Responsable estrade' })
    const mid = node({ name: 'Estrade', children: [deep] })
    const top = node({ name: 'Audio', children: [mid] })
    const root = node({ name: 'Anciens', key: 'elder', isRoster: true, children: [top] })

    const blocks = toLayout([root])

    // Every band sits at the same level; nesting is expressed by the header, not by margin.
    expect(blocks.filter(b => b.kind === 'band' && b.node != null).map(b => b.kind === 'band' && b.node?.name)).toEqual(
      ['Audio', 'Estrade'],
    )
  })

  it('still prints legacy roots that sit outside the rosters', () => {
    const solo = node({
      name: 'Covoiturage',
      holders: [
        { roleId: 0, memberId: 1, firstname: 'M', lastname: 'S', anonymizedAt: null, kind: 'leader', isElder: false },
      ],
    })
    const orphanTeam = node({ name: 'Equipe' })
    const orphan = node({ name: 'Hors structure', children: [orphanTeam] })

    const blocks = toLayout([solo, orphan])

    // « Covoiturage | Merk Serge » prints as one line on the sheet, not as a band with one entry.
    expect(blocks[0]).toMatchObject({ kind: 'row', id: solo.id })
    expect(blocks[1]).toMatchObject({ kind: 'band', id: orphan.id })
  })
})

describe('seatLabel', () => {
  it('titles an elder leading a group « Responsable », a brother « Préposé »', () => {
    // The vocabulary is the congregation's, not the app's: « responsable » is an elder's title;
    // a brother who is not an elder leads a service as its préposé.
    const group = node({ name: 'Audio/Vidéo' })

    expect(seatLabel({ kind: 'leader', isElder: true }, group)).toBe('Responsable')
    expect(seatLabel({ kind: 'leader', isElder: false }, group)).toBe('Préposé')
    expect(seatLabel({ kind: 'deputy', isElder: false }, group)).toBe('Adjoint')
    expect(seatLabel({ kind: 'member', isElder: true }, group)).toBeNull()
  })

  it('never titles the holder of a personal role', () => {
    // « Coordinateur du collège des anciens — RESPONSABLE Marc DUPONT » makes no sense: nobody
    // is responsible *of* a one-person role. The node name is the function; the person holds it.
    const personal = node({ name: 'Coordinateur du collège des anciens', isSinglePerson: true })

    expect(seatLabel({ kind: 'leader', isElder: true }, personal)).toBeNull()
    expect(seatLabel({ kind: 'leader', isElder: false }, personal)).toBeNull()
  })

  it('still labels a personal role’s adjoint', () => {
    const personal = node({ name: 'Coordinateur du collège des anciens', isSinglePerson: true })

    expect(seatLabel({ kind: 'deputy', isElder: false }, personal)).toBe('Adjoint')
  })

  it('suppresses a title the group’s own name already carries, in either vocabulary', () => {
    // An unflagged « Responsable de l'accueil » must not read « Responsable de l'accueil ·
    // Responsable » — and « Préposé aux comptes » must not read « … · Préposé » either.
    const named = node({ name: 'Responsable de l’accueil' })
    const prepose = node({ name: 'Préposé aux comptes' })

    expect(seatLabel({ kind: 'leader', isElder: true }, named)).toBeNull()
    expect(seatLabel({ kind: 'leader', isElder: false }, named)).toBeNull()
    expect(seatLabel({ kind: 'leader', isElder: false }, prepose)).toBeNull()
    // The adjoint's title is not the one the name carries — it stays.
    expect(seatLabel({ kind: 'deputy', isElder: false }, named)).toBe('Adjoint')
  })
})

describe('the committee keys mirror built-in-roles.server', () => {
  // COMMITTEE_KEY / POST_KEYS are module-private mirrors of the server constants, which this
  // client-bundled file cannot import. This proves behaviourally that they have not drifted: a
  // committee built from the server's own keys must be recognised, and its posts must come out
  // in the server's canonical order even when the tree holds them reversed.
  it('recognises a committee built from the server’s own keys, in the server’s post order', () => {
    const posts = SERVICE_COMMITTEE_POST_KEYS.map(key => node({ key, name: key, isSinglePerson: true }))
    const committee = node({ key: SERVICE_COMMITTEE_KEY, name: 'Comité', children: [...posts].reverse() })
    const elders = node({ key: 'elder', name: 'Anciens', isRoster: true, children: [committee] })

    const blocks = toLayout([elders])

    const bench = blocks.find(block => block.kind === 'committee')
    expect(bench?.posts.map(post => post.key)).toEqual([...SERVICE_COMMITTEE_POST_KEYS])
  })
})

describe('groupLayout — the renderer’s view', () => {
  it('splits the sheet into rosters, committee, header sections, and nothing legacy', () => {
    const t = standardTree()

    const grouped = groupLayout(toLayout([t.elders, t.assistants]))

    expect(grouped.rosters.map(roster => roster.id)).toEqual([t.elders.id, t.assistants.id])
    expect(grouped.committee?.id).toBe(t.committee.id)
    expect(grouped.sections.map(section => section.under)).toEqual([
      'Coordinateur',
      'Secrétaire',
      'Collège des anciens',
    ])
    expect(grouped.legacy).toEqual([])
  })

  it('keeps consecutive bands of one branch in a single section', () => {
    const t = standardTree()
    // Give the coordinator's branch a container next to its leaf: two bands, one header.
    t.accueil.children = [node({ name: 'Équipe Parking' })]

    const grouped = groupLayout(toLayout([t.elders, t.assistants]))

    const coordinator = grouped.sections.find(section => section.under === 'Coordinateur')
    expect(coordinator?.bands.length).toBe(2)
    expect(grouped.sections.filter(section => section.under === 'Coordinateur').length).toBe(1)
  })

  it('sends a root outside the rosters to the legacy pile, as a plain row', () => {
    const t = standardTree()
    const orphan = node({ name: 'Ancienne entrée' })

    const grouped = groupLayout(toLayout([t.elders, t.assistants, orphan]))

    expect(grouped.legacy).toEqual([expect.objectContaining({ kind: 'row', id: orphan.id })])
  })
})

describe('responsibilityEyebrow — the French contraction', () => {
  it('contracts « du » for a masculine post', () => {
    expect(responsibilityEyebrow('Coordinateur')).toBe('Sous la responsabilité du')
    expect(responsibilityEyebrow('Collège des anciens')).toBe('Sous la responsabilité du')
  })

  it('contracts « des » when the first word is plural', () => {
    expect(responsibilityEyebrow('Anciens')).toBe('Sous la responsabilité des')
  })

  it('elides before a vowel, accented or not', () => {
    expect(responsibilityEyebrow('Audio/Vidéo')).toBe('Sous la responsabilité de l’')
    expect(responsibilityEyebrow('Équipe technique')).toBe('Sous la responsabilité de l’')
  })
})

// A band's rows are not all teams. A personal role nested under another personal role is an
// adjoint arrangement — the settled model treats a child personal role as an adjoint, and its
// titulaire already folds into the parent's ADJOINTS — so naming it on the « ÉQUIPES » line
// announces a post as if it were a team, which is what the board sheet was doing.
describe('teamRows', () => {
  const porte = node({ name: 'Porte' })
  const auditorium = node({ name: 'Auditorium' })
  const adjointPost = node({ name: 'Responsable du programme des services', isSinglePerson: true })

  it('keeps group roles', () => {
    expect(teamRows([porte, auditorium]).map(row => row.name)).toEqual(['Porte', 'Auditorium'])
  })

  it('drops a personal role, which is an adjoint and not a team', () => {
    expect(teamRows([adjointPost]).map(row => row.name)).toEqual([])
  })

  it('keeps the teams and drops the post when a band has both', () => {
    expect(teamRows([porte, adjointPost, auditorium]).map(row => row.name)).toEqual(['Porte', 'Auditorium'])
  })

  it('preserves order', () => {
    expect(teamRows([auditorium, porte]).map(row => row.name)).toEqual(['Auditorium', 'Porte'])
  })

  it('returns nothing for an empty band', () => {
    expect(teamRows([])).toEqual([])
  })
})

// The other half of the same rule. A band folds the leaders of everything beneath it into its
// ADJOINTS line — that is how a team's préposé and a nested post's titulaire both reach the
// reader. Extracted from the two renderers, which carried identical copies: the screen view and
// the PDF drifting apart is how a fix lands in one and not the other.
describe('bandAdjoints', () => {
  const holder = (memberId: number, kind: string) => ({
    roleId: 0,
    memberId,
    firstname: `F${memberId}`,
    lastname: `L${memberId}`,
    anonymizedAt: null,
    kind,
    isElder: false,
  })

  it("folds a team's leader in as an adjoint", () => {
    const service = node({ holders: [holder(1, 'leader')] })
    const team = node({ holders: [holder(2, 'leader')] })

    expect(bandAdjoints(service, [team]).map(a => a.memberId)).toEqual([2])
  })

  // The point of the fix: a nested personal role contributes its titulaire here, so removing its
  // name from the ÉQUIPES line loses nothing — the person is still on the sheet.
  it("folds a nested post's titulaire in as an adjoint", () => {
    const post = node({ isSinglePerson: true, holders: [holder(1, 'leader')] })
    const child = node({ isSinglePerson: true, holders: [holder(2, 'leader')] })

    expect(bandAdjoints(post, [child]).map(a => a.memberId)).toEqual([2])
    expect(teamRows([child])).toEqual([])
  })

  it("keeps the band's own deputies, ahead of the folded ones", () => {
    const service = node({ holders: [holder(1, 'leader'), holder(2, 'deputy')] })
    const team = node({ holders: [holder(3, 'leader')] })

    expect(bandAdjoints(service, [team]).map(a => a.memberId)).toEqual([2, 3])
  })

  it('never repeats someone who already leads the band', () => {
    const service = node({ holders: [holder(1, 'leader')] })
    const team = node({ holders: [holder(1, 'leader')] })

    expect(bandAdjoints(service, [team])).toEqual([])
  })

  it('lists someone leading two teams once', () => {
    const service = node({ holders: [holder(1, 'leader')] })
    const a = node({ holders: [holder(2, 'leader')] })
    const b = node({ holders: [holder(2, 'leader')] })

    expect(bandAdjoints(service, [a, b]).map(x => x.memberId)).toEqual([2])
  })

  it('ignores plain members beneath the band', () => {
    const service = node({ holders: [holder(1, 'leader')] })
    const team = node({ holders: [holder(2, 'leader'), holder(3, 'member')] })

    expect(bandAdjoints(service, [team]).map(a => a.memberId)).toEqual([2])
  })
})
