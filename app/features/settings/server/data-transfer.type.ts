export const ARCHIVE_VERSION = '2.23'

// Older archive versions an import will still accept. v1.0 archives miss every
// post-shipping feature table (custom roles, allowed-roles, external speakers,
// card overlays, perimeter, board section visibility) — the import path warns
// and proceeds. v1.0 archives created before PR #152 also use the legacy
// `congregation-user-roles.ndjson` filename; the import handles that fallback.
// v2.0 splits `users.ndjson` into `members.ndjson` + `user-accounts.ndjson`
// and adds `member-role-assignments.ndjson`. v2.1 renames the domain models
// from `Programme*` to `Event*` / `Template*`; the AuditLog importer rewrites
// pre-2.1 `entityType` strings on the fly. v2.2 adds `emergency-contacts.ndjson`
// plus the two `Member` emergency flags (which ride along in `members.ndjson`);
// pre-2.2 archives import fine with the emergency table left empty. v2.3 adds
// `pioneer-goals.ndjson` (per-service-year hour overrides); pre-2.3 archives
// import fine with no overrides, so pioneers fall back to the built-in default
// rates. v2.4 adds `pioneer-enrolments.ndjson`; pre-2.4 archives have no
// enrolments, so the import backfills them from the activity history as a
// post-import step. v2.5 adds `part-presets.ndjson` and
// `part-preset-allowed-roles.ndjson`, and carries `presetId` on the four
// programme part tables; pre-2.5 archives simply import with every part
// unlinked, which is the same state a congregation is in before the backfill
// script runs, so nothing downstream needs to special-case it. v2.6 drops
// `part-preset-allowed-roles.ndjson` — eligibility lives on the parts, whose
// own rows import through the part importers — and merges the three seeded
// midweek talk kinds into 'midweek-talk'; the preset importer folds v2.5
// archives accordingly and discards their preset-level eligibility with a log
// line. v2.7 moves a template's responsible from a UserAccount to a Role, so
// `programme-template-responsibles.ndjson` carries `roleId` instead of `userId`;
// pre-2.7 rows are skipped on import with a log line rather than guessed at,
// because no mapping from a person back to "the role they meant" is safe.
// v2.8 adds `scope` to `programme-template-responsibles.ndjson`, so a template
// can name a second role responsible for its service parts alone; pre-2.8 rows
// have no scope and import as 'programme', the whole-event delegation they
// already were.
// v2.9 adds `appearance` to `board-dynamic-document-settings.ndjson`: the
// document's typeface, accent and layout. Pre-2.9 rows have none and import with
// the defaults, which is how those documents already looked.
// v2.10 adds `locale` to `user-accounts.ndjson`: the interface language an account
// chose for itself. Pre-2.10 rows have none: new accounts follow the congregation's
// language, and accounts that already exist keep theirs.
// v2.11 adds `arrivedAt` and `lastPastoralVisitAt` to `members.ndjson`: when the person
// arrived in the congregation and their last pastoral visit. Pre-2.11 rows have neither,
// which is how members recorded before these dates already were.
// v2.12 moves the roles given by hand from logins onto records: `member-role-assignments.ndjson`
// carries them with their `kind`, and only accounts without a record (and `admin`) keep rows in
// `user-role-assignments.ndjson`. Pre-2.12 archives carry every given role on the login; the
// importer hands a linked login's roles to its record, by the same rule as the migration.
// v2.13 makes the congregations whose list of speakers we receive records: `speaker-congregations.ndjson`
// (name, the two contacts, the date of the latest list — not its PDF), and `external-speakers.ndjson` gains
// `speakerCongregationId`, `phone2`, `email2`, `talks` and `anonymizedAt`. Pre-2.13 speakers carry only the free-text
// `congregationName`; the importer builds one congregation per spelling, by the same rule as the migration.
// v2.14 adds « Notre liste », the speakers we send: `our-speakers.ndjson` (each brother's entry, keyed to his record),
// and `speaker-congregations.ndjson` gains `ourListSentAt`, `ourListSentManually` and `ourListSentDigest`. Pre-2.14 archives import with no
// entry and every congregation never sent to, which is where a congregation starts.
// v2.15 adds meeting attendance: `attendance.ndjson` (each meeting's two counts and who entered them, keyed to its
// event), and `programme-templates.ndjson` gains `attendanceKind`. Pre-2.15 archives import with no counts; an existing
// template keeps its kind and a new one gets the default of its key, by the same rule as the migration.
// v2.16 carries what a restore lost: `events.ndjson` gains `status` (`released` or `draft`; an unknown one imports as a
// draft), `programme-templates.ndjson` gains `startTime` and `endTime`, and `board-dynamic-document-settings.ndjson`
// gains `dynamicConfig` (which templates a programme document shows, read through the imported templates). Every board
// document is now created rather than matched on its type and ref, which folded the programme documents into one.
// Pre-2.16 events import as drafts, templates keep their hours (a new one gets the defaults) and documents have no
// configuration, as before.
// v2.17 gives services an order: `programme-template-service-roles.ndjson` and
// `programme-service-role-assignments.ndjson` gain `order`. Pre-2.17 services are numbered by their id in the archive
// (the order they were created in, the migration's rule), each template and each event from 0 in steps of 5.
// v2.18 carries who created each event: `events.ndjson` gains `origin` (`job`, `manual` or `import`). A pre-2.18
// event without an author and with nothing on it comes back as the job's, by the migration's rule; any other as
// `import`, and so does one whose origin this version does not know.
// v2.19 carries the absences themselves: `absences.ndjson` (dates, note, `memberId` — the person's record, when there
// is one — `accountId` — who declared it, the owner when there is no record — the day-off event it was copied from,
// `createdAt`). A restore takes the absences from it, keeping one whose account or event did not come as long as its
// person did; a day-off the file does not cover still gets its absence from its author. Pre-2.19 archives have no such
// file: each absence comes back from its day-off event, owned by its author's record when the account has one. Since the
// day-off events and their template were dropped, a restore brings neither back from an older archive: it tells a
// day-off by the archive's own template key and restores its absence only.
// v2.20 drops `legacyEventId` from `absences.ndjson`: no day-off event is left for it to name. A 2.19 archive still
// carries it, and a restore reads it to know which of that archive's day-offs the absences file covers.
// v2.21 carries the schedules: `schedule-templates.ndjson` (each one's name or catalogue key, kind and responsible
// role), `kind-schedule-templates.ndjson` (which ones each template suggests, in order) and `schedules.ndjson`
// (each event's, with its own status); the four item files name theirs (`scheduleTemplateId`, `scheduleId`). A 2.20 or
// older archive carries none, and a restore gives them by the add_schedules migration's rule.
// v2.22 carries a programme template's rooms: `schedule-template-rooms.ndjson` (each one's name, the main room's `key`,
// order and schedule template) and `programme-template-part-rooms.ndjson` (the rooms each template part is held in);
// template parts no longer carry a room in `track`. A 2.21 or older archive brings a part in several rooms as one copy
// per room: a restore makes them one part held in their rooms, the template_rooms migration's rule.
// v2.23: a template part or service may belong to no kind (`templateId` null), the item of a schedule template no kind
// uses (6a-1c-2); it imports under its schedule template. Older archives have none.
// v1.x archives are listed here so the import path reports them with a warning rather than rejecting outright;
// `migrateLegacyUsersNdjson` splits their `users.ndjson` before the import runs.
export const SUPPORTED_ARCHIVE_VERSIONS = [
  '1.0',
  '1.1',
  '2.0',
  '2.1',
  '2.2',
  '2.3',
  '2.4',
  '2.5',
  '2.6',
  '2.7',
  '2.8',
  '2.9',
  '2.10',
  '2.11',
  '2.12',
  '2.13',
  '2.14',
  '2.15',
  '2.16',
  '2.17',
  '2.18',
  '2.19',
  '2.20',
  '2.21',
  '2.22',
  '2.23',
] as const

export interface ManifestJson {
  version: string
  exportDate: string
  sourceApp: string
  entityCounts: Record<string, number>
}

export interface ExportOptions {
  includeFiles: boolean
  includeAuditLogs: boolean
}

export interface ImportConflict {
  entityType: string
  naturalKey: Record<string, unknown>
  existingId: number
  action: 'skip' | 'update'
}

export interface ImportSummary {
  entityCounts: Record<string, number>
  conflicts: ImportConflict[]
  warnings: string[]
}

// Ordered by dependency — later entities reference earlier ones
export const ENTITY_FILES = [
  'congregation',
  'settings',
  'roles',
  'role-permissions',
  'members',
  'user-accounts',
  'user-role-assignments',
  'member-role-assignments',
  'congregation-user-permissions',
  'publisher-groups',
  'publisher-activities',
  'pioneer-enrolments',
  'emergency-contacts',
  'pioneer-goals',
  'speaker-congregations',
  'external-speakers',
  'our-speakers',
  'territories',
  'territory-kinds',
  'territory-kind-allowed-roles',
  'territory-card-overlays',
  'territory-perimeter',
  'buildings',
  'building-entrances',
  'building-accesses',
  'building-residential-data',
  'territory-entrance-links',
  'building-entrance-links',
  'attributions',
  'part-presets',
  'programme-templates',
  'schedule-templates',
  'kind-schedule-templates',
  'programme-template-parts',
  'programme-template-part-allowed-roles',
  'schedule-template-rooms',
  'programme-template-part-rooms',
  'programme-template-service-roles',
  'programme-template-service-role-allowed-roles',
  'programme-template-responsibles',
  'events',
  'absences',
  'attendance',
  'schedules',
  'programme-part-assignments',
  'programme-part-assignment-allowed-roles',
  'programme-service-role-assignments',
  'programme-service-role-assignment-allowed-roles',
  'board-sections',
  'board-section-visibility-roles',
  'board-documents',
  'board-document-versions',
  'board-dynamic-document-settings',
  'consent-records',
  'audit-logs',
  'data-deletion-records',
] as const

export type EntityFile = (typeof ENTITY_FILES)[number]

/**
 * Tracks old ID -> new ID mappings per entity type during import.
 */
export class EntityIdMap {
  private maps = new Map<string, Map<number, number>>()

  set(entity: string, oldId: number, newId: number): void {
    let map = this.maps.get(entity)
    if (!map) {
      map = new Map()
      this.maps.set(entity, map)
    }
    map.set(oldId, newId)
  }

  get(entity: string, oldId: number): number {
    const newId = this.maps.get(entity)?.get(oldId)
    if (newId === undefined) {
      throw new Error(`Missing ID mapping for ${entity}#${oldId}`)
    }
    return newId
  }

  getOptional(entity: string, oldId: number | null | undefined): number | null {
    if (oldId == null) return null
    return this.maps.get(entity)?.get(oldId) ?? null
  }
}
