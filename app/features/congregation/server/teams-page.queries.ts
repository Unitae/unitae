import type { MatrixGroup, MatrixMember } from '~/features/congregation/model/role-matrix.type'
import type { BuiltInFilterKey } from '~/features/congregation/schemas/role.schema'
import { buildMatrixGroups } from '~/features/congregation/server/role-matrix.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// The Équipes page: who is in which team. Everyone in the congregation is a row — login or not — and a view narrows
// the rows. Congregations are small, so the people are read once and the views are counted and applied here.

interface PersonFacts {
  isPublisher: boolean
  /** Unknown on some records: such a person is neither among the brothers nor the sisters. */
  isMale: boolean | null
  baptismDate: Date | null
  isAnointed: boolean
  isHelder: boolean
  isServant: boolean
}

/** Who each view shows. A targeted view keeps publishers only, as the role sync does; « Tous » keeps everyone. */
const VIEWS: Record<BuiltInFilterKey, (person: PersonFacts) => boolean> = {
  all: () => true,
  male: person => person.isPublisher && person.isMale === true,
  female: person => person.isPublisher && person.isMale === false,
  elder: person => person.isPublisher && person.isHelder,
  'assistant-servant': person => person.isPublisher && person.isServant,
  publisher: person => person.isPublisher,
  baptized: person => person.isPublisher && person.baptismDate != null,
  anointed: person => person.isPublisher && person.isAnointed,
}

export const TEAMS_VIEWS = Object.keys(VIEWS) as BuiltInFilterKey[]

export interface TeamsPage {
  groups: MatrixGroup[]
  /** Everyone holding each team, whatever the view: « Sono · 4 » stays true while the rows show the sisters. */
  counts: Record<number, number>
  members: MatrixMember[]
  /** How many people each view shows. */
  views: Record<BuiltInFilterKey, number>
}

const DIACRITICS = /\p{Diacritic}/gu
const SPACES = /\s+/

const normalize = (value: string) => value.normalize('NFD').replace(DIACRITICS, '').toLocaleLowerCase().trim()

/** Every word typed is found in the person's name, in any order: « paul ber » finds Paul BERNARD. */
function matches(person: { firstname: string | null; lastname: string | null }, search: string): boolean {
  const words = normalize(search).split(SPACES).filter(Boolean)
  if (words.length === 0) return true
  const name = normalize(`${person.firstname ?? ''} ${person.lastname ?? ''}`)
  return words.every(word => name.includes(word))
}

export async function loadTeamsPage(
  db: TransactionClient,
  congregationId: number,
  options: { search: string; view: BuiltInFilterKey; collapsed: ReadonlySet<string> },
): Promise<TeamsPage> {
  // Built-ins come along for structure — the bands are the committee posts' branches of the organigram — but only
  // custom roles become columns.
  const roles = await db.role.findMany({
    where: { congregationId },
    select: {
      id: true,
      key: true,
      name: true,
      isBuiltIn: true,
      isSinglePerson: true,
      showInOrganigram: true,
      parentRoleId: true,
      organigramOrder: true,
    },
  })
  // Seats sit on records, or on logins for accounts without one: both are counted. Split by seat kind, the same rows
  // say which roles still hold plain members — columns that must stay visible until emptied.
  const countWhere = { congregationId, role: { isBuiltIn: false } }
  const assignmentCounts = [
    ...(await db.memberRoleAssignment.groupBy({
      by: ['roleId', 'kind'],
      where: countWhere,
      // biome-ignore lint/style/useNamingConvention: Prisma aggregate field
      _count: { roleId: true },
    })),
    ...(await db.userRoleAssignment.groupBy({
      by: ['roleId', 'kind'],
      where: countWhere,
      // biome-ignore lint/style/useNamingConvention: Prisma aggregate field
      _count: { roleId: true },
    })),
  ]
  const counts: Record<number, number> = {}
  for (const row of assignmentCounts) counts[row.roleId] = (counts[row.roleId] ?? 0) + row._count.roleId
  const withPlainMembers = new Set(assignmentCounts.filter(row => row.kind === 'member').map(row => row.roleId))

  const people = await db.member.findMany({
    where: { congregationId, anonymizedAt: null, leftAt: null },
    select: {
      id: true,
      firstname: true,
      lastname: true,
      isPublisher: true,
      isMale: true,
      baptismDate: true,
      isAnointed: true,
      isHelder: true,
      isServant: true,
      // Roles given by hand sit on the record, login or not; a few older rows may still sit on the login.
      roleAssignments: { where: { role: { isBuiltIn: false } }, select: { roleId: true, kind: true } },
      account: {
        select: { roleAssignments: { where: { role: { isBuiltIn: false } }, select: { roleId: true, kind: true } } },
      },
    },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })

  const shown = VIEWS[options.view]
  return {
    groups: buildMatrixGroups(roles, options.collapsed, withPlainMembers),
    counts,
    members: people
      .filter(person => shown(person) && matches(person, options.search))
      .map(person => ({
        id: person.id,
        firstname: person.firstname,
        lastname: person.lastname,
        // The record wins over a stale login row.
        seats: Object.fromEntries(
          [...(person.account?.roleAssignments ?? []), ...person.roleAssignments].map(seat => [seat.roleId, seat.kind]),
        ),
      })),
    views: Object.fromEntries(TEAMS_VIEWS.map(view => [view, people.filter(VIEWS[view]).length])) as Record<
      BuiltInFilterKey,
      number
    >,
  }
}
