# Spec: Publisher Emergency-Preparedness Information

**Status:** Draft — design agreed with the maintainer; not yet implemented
**Author:** Nathanaël Cherrier
**Feature area:** `features/publishers`
**Related:** [Permissions and Roles](../permissions-and-roles.md), [Architecture Conventions](../architecture-conventions.md), [Row-Level Security](../row-level-security.md), [Data Transfer](../data-transfer.md)

> This is a proposal, not documentation of current behavior. Once built, the steady-state
> behavior should be folded into `docs/product/publishers.md` and this file archived.

## 1. Problem

Congregations need to record and quickly consult **emergency-preparedness data** per publisher in a
crisis: whether their **DPA card** (directive médicale anticipée) is up to date, whether their
**survival backpack** ("sac de survie") is ready, and **who to contact** about them. Today the
`Member` model has only `phone`/`address`; there is no emergency data, and no way for a **group
responsible** to maintain it for their own group without full publisher-management rights.

## 2. Goals / Non-goals

**Goals**

- Record per publisher: `dpaCardUpToDate` (bool), `survivalBackpackReady` (bool), and a list of
  **emergency contacts** (name · relationship · phone).
- Let a **group responsible / deputy** view **and** edit this data **for their own group only**,
  without any other publisher permission.
- Let the **coordinator / secretary** manage it **congregation-wide** via new global permissions.
- Consult it on the **publisher detail page** and as **printable PDF rosters** — congregation-wide
  and per-group.
- Purge third-party contact PII on member anonymization / retention.

**Non-goals**

- Splitting the existing `PublisherManager` into per-section permissions for Personal / Nomination /
  Field service / Contact — **deferred**; the section-gated structure here makes it an incremental
  follow-up.
- A per-congregation feature toggle to hide emergency data. *(Future.)*
- Excel export of rosters, structured (enum) relationship values, DPA expiry dates. *(Future.)*

## 3. Users & access model

Two orthogonal grant sources, unioned — mirroring the app's model where **permissions are global**
and **group responsibility is a scope**. The only existing group-scoped precedent is the activity
*entry* form (`activity/new.tsx`, `canManageMyGroupActivity`); this feature extends that same
pattern. There is no scoped-permission machinery to reuse, so the scope check is threaded explicitly.

- **Global** — two new permissions granted through roles (coordinator/secretary):
  `EmergencyInfoViewer` (read), `EmergencyInfoManager` (read+edit). Congregation-wide.
- **Scoped** — derived, **no permission entry**: a member who is `responsibleFor` / `deputyFor` a
  group may view+edit emergency info for members **of that group**. `currentUser.member.responsibleFor`
  / `deputyFor` are already eager-loaded on `currentAccountContext` — zero extra queries.

Access rules (pure functions, §8):

```
canView(target)    = hasViewer || hasManager || isRespOrDeputyOf(target.groupId)
canManage(target)  = hasManager || isRespOrDeputyOf(target.groupId)
isRespOrDeputyOf(g) = g != null && (g === myResponsibleGroupId || g === myDeputyGroupId)
```

Admin already expands to every permission in `resolveEffectivePermissions`.

## 4. Domain background & conventions consulted

- **Member is an aggregate** (`AGGREGATE_MODELS = ['member','attribution']`): any `db.member.*`
  write must live in a `*.aggregate.ts` file (suffix-checked by `pnpm test:aggregate-boundaries`).
- **Aggregate doctrine**: don't create aggregates speculatively. `EmergencyContact` has no
  invariant / state-machine → **no aggregate for it**, and it is **not** added to `AGGREGATE_MODELS`.
- **CQRS-lite**: writes in `*.aggregate.ts`, reads in `*.queries.ts` — never mixed.
- **File-size budgets**: `*.aggregate.ts` hard limit 350; `member.aggregate.ts` is near the limit →
  must not grow materially. Route `*.tsx` hard 300 (`edit-publisher.tsx` already large → don't embed
  the emergency form there).
- **RLS**: every tenant table carries denormalised `congregationId` + `@@unique([id, congregationId])`
  + a `tenant_isolation` policy using the `CASE WHEN NULLIF(current_setting('app.congregation_id',
  true), '') IS NULL THEN true …` guard (never `OR`).
- **TDD** required for new service functions + bug regressions: test first, run, watch fail, then
  implement. **No React component tests** — logic goes in pure functions.
- **Barrels**: client-safe via `features/publishers/index.ts`, server via `index.server.ts`; named
  re-exports only.
- **i18n**: French primary; snake_case keys in `en.json` + `fr.json`.

## 5. Design overview

```
model/emergency-access.ts          (pure: canView / canManage)      ← client+server, TDD-first
schemas/emergency-info.schema.ts   (booleans + contacts array)
server/emergency-info.aggregate.ts (updateEmergencyInfo, purgeEmergencyContacts) ← Member flags + EmergencyContact
server/emergency.queries.ts        (getEmergencyInfoForMember, getPublishersWithEmergencyInfo{groupId?})
ui/EmergencyRosterDocument.tsx     (react-pdf single-document roster)
        ├─► publisher.tsx                    — read "Urgence" card (canView)
        ├─► routes/publishers/emergency.tsx  — dedicated view+edit page (emergency rule)
        └─► roster routes                    — congregation (global) + per-group (scoped) PDF
```

**Why a dedicated `/publishers/:id/emergency` route** rather than a card inside the edit form: group
responsibles typically hold *no* publisher permission, so `publisher.tsx` (`PublisherViewer`) and
`edit-publisher.tsx` (`PublisherManager`) are both closed to them. The emergency edit surface must be
independently routed and gated **only** on the emergency rule, reachable via the per-group roster.
This realises the section-gating principle for the one section needing scoped access; the four
existing sections (Personal / Nomination / Field service / Contact) are untouched and keep
`PublisherViewer`/`PublisherManager` — no permission-data migration.

## 6. Data model — `app/database/schema.prisma`

Two scalars on `Member` (idiomatic, like `phone`/`address`; a 1:1 profile table was considered and
rejected as over-abstraction for two booleans) + one child table:

```prisma
model Member {
  // …
  dpaCardUpToDate       Boolean @default(false)
  survivalBackpackReady Boolean @default(false)
  emergencyContacts     EmergencyContact[]
}

model EmergencyContact {
  id           Int      @id @default(autoincrement())
  member       Member   @relation(fields: [memberId, congregationId], references: [id, congregationId], onDelete: Cascade)
  memberId     Int
  name         String
  relationship String   @default("")   // free text
  phone        String   @default("")
  createdAt    DateTime @default(now())

  congregation   Congregation @relation(fields: [congregationId], references: [id])
  congregationId Int

  @@unique([id, congregationId])
  @@index([congregationId])
  @@index([memberId, congregationId])
}
```

Add `emergencyContacts EmergencyContact[]` to `Congregation`. Model on `ExternalSpeaker` /
`BuildingAccess`.

**Migration** (`{timestamp}_add_emergency_contact/migration.sql`): generate with `pnpm prisma migrate
diff --from-config-datasource --to-schema app/database/schema.prisma --script`, then hand-add the two
`ALTER TABLE "Member" ADD COLUMN … DEFAULT false`, the `EmergencyContact` table + indexes + the two
FKs (member composite `ON DELETE CASCADE`, congregation `ON DELETE RESTRICT`), the RLS block (copied
from `20260502000000_add_external_speaker_registry`), and seed the two **global** permission rows so
existing congregations get them:

```sql
INSERT INTO "Permission" ("key") VALUES ('emergency-info-viewer'),('emergency-info-manager')
  ON CONFLICT ("key") DO NOTHING;
```

`pnpm prisma migrate deploy && pnpm prisma generate`. Copy `schema.prisma` to `unitae-platform` and
`pnpm prisma generate` there.

## 7. Access & permissions

Follows [permissions-and-roles.md › Adding a new permission](../permissions-and-roles.md):

- `app/shared/types/permission.ts` — `EmergencyInfoViewer = 'emergency-info-viewer'`,
  `EmergencyInfoManager = 'emergency-info-manager'` (kebab DB key, `<Domain>Viewer`/`<Domain>Manager`
  convention).
- `app/shared/types/permission-display.ts` — add to the exhaustive `Record<Permission,…>` maps;
  introduce a new `'emergency'` `PermissionCategory` (add to `PERMISSION_CATEGORIES` +
  `CATEGORY_LABELS`) so both surface in `RolePermissionPicker`.
- `app/i18n/messages/{en,fr}.json` — `permission_desc_emergency_info_viewer`/`_manager`,
  `permission_category_emergency`, plus all UI strings.
- Permission rows: auto-seeded for new installs (`seedPermissions` iterates `Object.values(Permission)`);
  existing installs via the migration INSERT (§6). No default role pre-attach.
- Route guards: `permissions.has(...)` + the scoped pure resolver (§8) in loaders/actions;
  server-side re-check in the emergency action.
- **Audit**: add `EmergencyInfoUpdated: 'emergency_info.updated'` to `AuditAction`
  (`audit.server.ts`) — a new auditable user action (free String column, no migration).

## 8. Server & code changes

**Model** `app/features/publishers/model/emergency-access.ts` (pure, no `.server`, `.test.ts`
first): `canViewEmergencyInfo(input)` / `canManageEmergencyInfo(input)` taking `{ hasViewer,
hasManager, myResponsibleGroupId, myDeputyGroupId, targetGroupId }`.

**Writes** `app/features/publishers/server/emergency-info.aggregate.ts` (+ unit test mocking
`db`/`audit`, TDD-first; + integration test):

- `updateEmergencyInfo(db, memberId, congregationId, actorId, { dpaCardUpToDate,
  survivalBackpackReady, contacts })` — updates the two `Member` flags and **replaces** contacts
  (`deleteMany` by `memberId` → `createMany` with `congregationId: 0 as number`, RLS injects the real
  value), then `audit(EmergencyInfoUpdated, entityType:'Member', entityId:memberId)`.
- `purgeEmergencyContacts(db, memberId, congregationId)` — `deleteMany` for anonymize.
- It is a `*.aggregate.ts` file **because** it writes `Member` flags (guarded model);
  `EmergencyContact` is left out of `AGGREGATE_MODELS` (no invariant). Keeps `member.aggregate.ts`
  from growing.

**Anonymize purge** — in `memberAggregate.anonymize` (`member.aggregate.ts`), add a single
`purgeEmergencyContacts(...)` call (anonymize is an UPDATE → cascade won't fire). Verify the
settings-side `anonymizeMember` and the retention cron route through `memberAggregate.anonymize`;
extend `member.aggregate.integration.test.ts` with a contacts-purged regression.

**Reads** `app/features/publishers/server/emergency.queries.ts` (+ test):
`getEmergencyInfoForMember(db, memberId, congregationId)`; `getPublishersWithEmergencyInfo(db,
congregationId, { groupId? })` (scope modelled on `getPublishersWithYearActivities`).

**Barrels**: `index.ts` re-exports `emergency-access` fns, the schema, and the UI component;
`index.server.ts` re-exports the aggregate + queries.

## 9. Data transfer (export/import)

A new tenant table must be wired into the `.unitae` archive ([data-transfer.md](../data-transfer.md)),
in `app/features/settings/server/`:

- **Export** — add `EmergencyContact` to `ENTITY_FILES` and to `buildExportSteps`
  (`export-congregation.server.ts`) in dependency order **after `Member`** (it FKs Member). The two
  new `Member` booleans ride along in the existing `members.ndjson` row serialization.
- **Import** — add an `importEmergencyContacts` step (`import-congregation.server.ts`) that remaps
  `memberId` through the `EntityIdMap` (fresh ids, always insert).
- **Version** — bump `ARCHIVE_VERSION` `2.1 → 2.2` in `data-transfer.type.ts` and add `2.1` to
  `SUPPORTED_ARCHIVE_VERSIONS` (older archives import with the table empty — acceptable).

## 10. Rosters (PDF)

Single-document PDF via `renderPdfResponse(document, filename)` (`app/shared/infra/pdf.server.ts`)
from a plain **loader** route (no action/form), modelled on
`publishers/routes/publishers/activity-pdf.tsx` — not the per-member zip. A
`ui/EmergencyRosterDocument.tsx` react-pdf document (publishers → DPA, backpack, contacts). Two loader
routes:

- **Congregation** — `/publishers/emergency-roster`, gated on `EmergencyInfoViewer`/`Manager`; all
  groups. Reached from a download button on the **publisher list** header (`/publishers`).
- **Per-group** — `/publishers/emergency-roster/:groupId`; access = global viewer/manager (any group)
  **or** responsible/deputy of that group (their group only). Reached from a download button on the
  **group detail page** (`/groups/:id/view`).

## 11. UI

- **Detail read section** `routes/publishers/publisher.tsx`: loader computes `canViewEmergency`;
  render an "Urgence" `Card` (DPA / sac de survie oui-non + contacts list) when allowed; edit link to
  `/publishers/:id/emergency` when `canManageEmergency`.
- **Dedicated page** `routes/publishers/emergency.tsx` (register in `app/routes.ts`): loader + action
  both re-check view/manage server-side and call `updateEmergencyInfo`.
- **Form** `ui/PublisherEmergencyForm.tsx`: two checkboxes (`z.string().optional().transform(v =>
  v === 'on')`) + a repeatable contacts list via Conform `useForm` + `getFieldList` (indexed
  `contacts[i].name`), validated by `z.array(z.object({ name: z.string().min(1), relationship:
  z.string(), phone: z.string() }))`. Schema in `schemas/emergency-info.schema.ts`.
- **Edit page** `edit-publisher.tsx`: add a link to the emergency page; do not embed the form.

## 12. Phasing

1. **Data + access + edit + read** — schema/migration, permissions wiring, `emergency-access`,
   `emergency-info.aggregate` + purge, `emergency.queries`, the dedicated emergency page + form, and
   the detail-page read card.
2. **Rosters** — congregation + per-group PDF and the "Urgences" nav entry.

## 13. Testing

- `emergency-access.test.ts` — view/manage truth table across global perms × scope.
- `emergency-info.schema.test.ts` — checkbox transform + contacts array parse.
- `emergency-info.aggregate.test.ts` (unit, mock db/audit) + `*.integration.test.ts` (DB round-trip +
  RLS).
- `emergency.queries.test.ts` — scoped `where` with/without `groupId`.
- Anonymize regression (integration) — contacts purged.
- Guards: `pnpm test:service-test-coverage`, `test:aggregate-boundaries`, `test:boundaries`,
  `test:server-barrel-exports`. Routes / UI / rosters are TDD-exempt (driven by end-to-end verify).
- Black-box style, sentinels for negatives; no React component tests.

## 14. Open questions

1. **Default role pre-attach** — leave the new permissions fully admin-assigned, or seed onto a
   built-in role? *(Lean: admin-assigned.)*

## 15. Reachability note

Roster PDFs and the emergency section are reached from the existing publisher surfaces (publisher
list, group page, publisher detail), all gated on `PublisherViewer`. A group responsible who holds
**no** publisher permission therefore has no in-app entry point today — there is no dedicated
"Urgences" nav. If that persona must self-serve, add a nav/dashboard entry (deliberately omitted for
now to keep the surface small).
