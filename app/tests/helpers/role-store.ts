// An in-memory congregation for the role and seat services: roles, records with or without a login, the two
// assignment tables and role permissions. It answers the Prisma calls those services make, so their tests can read
// the tables back instead of spying on calls.

export interface StoredRole {
  id: number
  key: string
  isBuiltIn?: boolean
  isSinglePerson?: boolean
  permissions?: string[]
}

export interface StoredPerson {
  memberId: number
  /** The login, if the person has one. */
  userId?: number | null
}

export interface AssignmentRow {
  roleId: number
  congregationId: number
  kind: string
  memberId?: number
  userId?: number
}

type Where = Record<string, unknown>

export function createRoleStore(congregationId: number, roles: StoredRole[], people: StoredPerson[]) {
  const records: AssignmentRow[] = []
  const logins: AssignmentRow[] = []
  const roleById = (id: number) => roles.find(role => role.id === id)
  const loginOf = (memberId: number) => people.find(p => p.memberId === memberId)?.userId ?? null
  const recordOf = (userId: number) => people.find(p => p.userId === userId)?.memberId ?? null

  function matches(row: AssignmentRow, where: Where): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'NOT') return !matches(row, value as Where)
      if (key === 'user') {
        const wanted = (value as { memberId: { in: number[] } }).memberId.in
        return row.userId != null && wanted.includes(recordOf(row.userId) as number)
      }
      if (key === 'role') {
        const wanted = value as { key?: string }
        return wanted.key == null || roleById(row.roleId)?.key === wanted.key
      }
      if (value != null && typeof value === 'object' && 'in' in value) {
        return (value as { in: unknown[] }).in.includes(row[key as keyof AssignmentRow])
      }
      return row[key as keyof AssignmentRow] === value
    })
  }

  function table(rows: AssignmentRow[], decorate: (row: AssignmentRow) => Record<string, unknown>) {
    const pick = (where: Where) => rows.filter(row => matches(row, where))
    return {
      findFirst: async ({ where }: { where: Where }) => {
        const row = pick(where)[0]
        return row ? { ...row, ...decorate(row) } : null
      },
      findMany: async ({ where }: { where: Where }) => pick(where).map(row => ({ ...row, ...decorate(row) })),
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: Record<string, Where>
        create: AssignmentRow
        update: Partial<AssignmentRow>
      }) => {
        const found = pick(Object.values(where)[0] ?? {})[0]
        if (found) Object.assign(found, update)
        else rows.push({ ...create })
      },
      createMany: async ({ data }: { data: AssignmentRow[] }) => {
        const fresh = data.filter(
          row => !rows.some(r => r.roleId === row.roleId && r.memberId === row.memberId && r.userId === row.userId),
        )
        rows.push(...fresh.map(row => ({ ...row, kind: row.kind ?? 'member' })))
        return { count: fresh.length }
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const doomed = new Set(pick(where))
        const kept = rows.filter(row => !doomed.has(row))
        rows.splice(0, rows.length, ...kept)
        return { count: doomed.size }
      },
    }
  }

  const db = {
    role: {
      findMany: async ({ where }: { where: { key?: { in: string[] } } }) =>
        roles.filter(r => where.key == null || where.key.in.includes(r.key)).map(r => ({ id: r.id, key: r.key })),
      findFirst: async ({ where }: { where: { id?: number; key?: string } }) => {
        const role = roles.find(
          r => (where.id == null || r.id === where.id) && (where.key == null || r.key === where.key),
        )
        return role ? { isBuiltIn: false, isSinglePerson: false, parentRoleId: null, ...role } : null
      },
    },
    member: {
      findFirst: async ({ where }: { where: { id: number; congregationId: number } }) => {
        const person = people.find(p => p.memberId === where.id)
        if (!person || where.congregationId !== congregationId) return null
        return { id: person.memberId, account: person.userId != null ? { id: person.userId } : null }
      },
    },
    userAccount: {
      findFirst: async ({ where }: { where: { id: number; congregationId: number } }) => {
        const person = people.find(p => p.userId === where.id)
        if (where.congregationId !== congregationId) return null
        return person ? { id: where.id, memberId: person.memberId } : { id: where.id, memberId: null }
      },
    },
    memberRoleAssignment: table(records, row => ({
      member: { account: loginOf(row.memberId as number) != null ? { id: loginOf(row.memberId as number) } : null },
    })),
    userRoleAssignment: table(logins, row => ({ user: { memberId: recordOf(row.userId as number) } })),
    rolePermission: {
      findMany: async ({ where }: { where: { roleId: { in: number[] } } }) =>
        where.roleId.in.flatMap(id => (roleById(id)?.permissions ?? []).map(key => ({ permission: { key } }))),
      findFirst: async ({ where }: { where: { roleId: { in: number[] }; permission?: { key: string } } }) => {
        const key = where.permission?.key
        const id = where.roleId.in.find(roleId => key == null || roleById(roleId)?.permissions?.includes(key))
        return id == null ? null : { roleId: id }
      },
    },
  }

  /** The seats of a person, `roleKey:kind`, from both tables. */
  function seatsOf(memberId: number): string[] {
    const userId = loginOf(memberId)
    return [
      ...records.filter(r => r.memberId === memberId),
      ...logins.filter(r => userId != null && r.userId === userId),
    ]
      .map(row => `${roleById(row.roleId)?.key}:${row.kind}`)
      .sort()
  }

  return { db: db as never, records, logins, seatsOf }
}
