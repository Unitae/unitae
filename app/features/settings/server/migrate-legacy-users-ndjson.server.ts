import type JsZip from 'jszip'
import { readNdjsonFile, writeNdjsonFile } from './ndjson-archive'

interface LegacyUserRow {
  id: number
  firstname: string | null
  lastname: string | null
  email: string
  active: boolean
  emailVerifiedAt: string | null
  platformAdmin?: boolean
  isPublisher: boolean
  type?: string | null
  isMale?: boolean | null
  birthDate?: string | null
  baptismDate?: string | null
  isHelder?: boolean
  isServant?: boolean
  isAnointed?: boolean
  publisherGroupId?: number | null
  phone?: string | null
  address?: string | null
  anonymizedAt?: string | null
  createdAt: string
  updatedAt: string
}

// Same set of signals the original schema migration used to decide whether a
// legacy User row corresponds to a person in the congregation (Member) vs a
// pure login. Kept in sync with `app/database/migrations/.../migration.sql`.
function legacyUserIsMember(row: LegacyUserRow): boolean {
  return (
    row.isPublisher === true ||
    row.baptismDate != null ||
    row.isHelder === true ||
    row.isServant === true ||
    row.isAnointed === true ||
    row.publisherGroupId != null
  )
}

function isPlaceholderEmail(email: string): boolean {
  return email.endsWith('@placeholder.unitae.app')
}

/**
 * v1.x compatibility: legacy archives have a single `users.ndjson` carrying
 * both person-side fields (publisher status, baptism, …) and account-side
 * fields (email, password). When the archive is older than v2.0 and we see
 * `users.ndjson` but no `members.ndjson` / `user-accounts.ndjson`, split each
 * row into the new shape on the fly and write the synthesized NDJSON files
 * back into the in-memory zip. Downstream import functions then read the
 * v2.0 layout normally — no further code paths know about v1.x.
 *
 * Placeholder-email accounts (`*.placeholder.unitae.app`) are dropped:
 * they were never real logins, and any FK that pointed at them is preserved
 * by reusing the legacy id space on the Member side.
 *
 * Returns a list of warnings describing what was split / skipped, to surface
 * back to the operator running the import.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one row → up to two NDJSON shapes; the branches are the heuristic
export async function migrateLegacyUsersNdjson(zip: JsZip, manifestVersion: string): Promise<string[]> {
  if (manifestVersion !== '1.0' && manifestVersion !== '1.1') return []
  const legacyFile = zip.file('data/users.ndjson')
  if (!legacyFile) return []
  // Archives that already shipped v2.0 entries take precedence.
  if (zip.file('data/members.ndjson') != null || zip.file('data/user-accounts.ndjson') != null) {
    return []
  }

  const legacy = await readNdjsonFile<LegacyUserRow>(zip, 'users')

  const members: object[] = []
  const accounts: object[] = []
  let placeholderDropped = 0

  for (const row of legacy) {
    const isMember = legacyUserIsMember(row)
    const isRealAccount = !isPlaceholderEmail(row.email)

    if (isMember) {
      members.push({
        id: row.id,
        firstname: row.firstname ?? '',
        lastname: row.lastname ?? '',
        isPublisher: row.isPublisher,
        type: row.type ?? 'normal',
        isMale: row.isMale ?? null,
        phone: row.phone ?? '',
        address: row.address ?? '',
        birthDate: row.birthDate ?? null,
        baptismDate: row.baptismDate ?? null,
        isHelder: row.isHelder ?? false,
        isServant: row.isServant ?? false,
        isAnointed: row.isAnointed ?? false,
        leftAt: null,
        anonymizedAt: row.anonymizedAt ?? null,
        publisherGroupId: row.publisherGroupId ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    }

    if (isRealAccount) {
      accounts.push({
        id: row.id,
        // Link to the Member only when we synthesized one (same id space).
        memberId: isMember ? row.id : null,
        // When the account isn't tied to a Member, keep the display name on
        // the account so it can still render.
        firstname: isMember ? null : (row.firstname ?? null),
        lastname: isMember ? null : (row.lastname ?? null),
        email: row.email,
        active: row.active,
        emailVerifiedAt: row.emailVerifiedAt ?? null,
        platformAdmin: row.platformAdmin ?? false,
        anonymizedAt: row.anonymizedAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    } else {
      placeholderDropped++
    }
  }

  writeNdjsonFile(zip, 'members', members)
  writeNdjsonFile(zip, 'user-accounts', accounts)
  // No `member-role-assignments` synthesized — v1.x didn't track Member-side
  // identity roles. `syncBuiltInRoleAssignments` runs after Member inserts
  // during the regular import path and recomputes them from the flags.

  const warnings: string[] = [
    `Archive v${manifestVersion}: ${legacy.length} legacy user row(s) split into ${members.length} member(s) and ${accounts.length} account(s) on the fly.`,
  ]
  if (placeholderDropped > 0) {
    warnings.push(
      `${placeholderDropped} placeholder-email account(s) (legacy *@placeholder.unitae.app) skipped — they were never real logins.`,
    )
  }
  return warnings
}
