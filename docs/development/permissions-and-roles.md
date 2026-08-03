# Permissions and Roles

This page explains the authorization model that gates every authenticated route in the app: what a permission is, what a role is, how they're stored, how a user's effective set is resolved, and how to add a new permission.

For the end-user view of the same system, see the product doc: [Roles and Permissions](../product/roles-and-permissions.md).

## Two layers, distinct concepts

- **Permission** — the unit of access. A finite, code-defined enum (24 entries) declared in `app/shared/types/permission.ts`. New permissions require code + migration changes.
- **Role** — a named bundle of permissions. Lives in the database (`Role` table), scoped to a congregation. Roles can be **built-in** (seeded, identity-stable, auto-synced from `Member` flags) or **custom** (created at runtime by a Roles Manager and assigned to a `UserAccount`).

Built-in identity roles attach to **`Member`** via `MemberRoleAssignment`. Custom roles (and the management permissions they grant) attach to **`UserAccount`** via `UserRoleAssignment`. The two tables are siblings: identity ("you are an elder") vs access ("you can manage roles").

Users do not hold permissions through roles only — there is also a direct `CongregationUserPermission` table for one-off grants. Both sources are unioned at request time.

## Where things live

| Concern | Path |
|---|---|
| Permission enum (source of truth) | `app/shared/types/permission.ts` |
| Built-in role keys + auto-assignment predicates | `app/shared/domain/built-in-roles.server.ts` |
| Custom role CRUD (create/update/delete, permission sync, user assignment) | `app/shared/domain/roles.server.ts` |
| Effective-permission resolver | `app/shared/auth/permissions.server.ts` |
| Auth middleware that runs the resolver | `app/shared/auth/middleware.server.ts` |
| Typed contexts (`currentAccountContext`, `congregationContext`, `permissionsContext`) | `app/shared/auth/route-context.server.ts` |
| Role admin UI | `app/features/congregation/routes/roles/` |
| User assignment UI | settings — see `app/features/settings/` |

Database schema is in `app/database/schema.prisma`. The relevant tables are `Permission`, `Role`, `RolePermission`, `UserRoleAssignment` (custom/management roles, on `UserAccount`), `MemberRoleAssignment` (built-in identity roles, on `Member`), and `CongregationUserPermission`.

## Resolution flow

When a request hits an authenticated layout:

1. `requireAuth()` middleware runs (`app/shared/auth/middleware.server.ts`). It calls `verifySession`, then `resolveEffectivePermissions(userId, congregationId)`, then enforces GDPR consent.
2. `resolveEffectivePermissions` (`app/shared/auth/permissions.server.ts`) reads two sources in parallel:
   - direct grants from `CongregationUserPermission`
   - role-mediated grants from `RolePermission` joined to roles the `UserAccount` holds via `UserRoleAssignment` (custom/management roles only — identity-role assignments on `MemberRoleAssignment` aren't consulted here, since identity roles don't carry permissions by themselves)
   It unions both, and if the result contains `Permission.Admin`, expands it to every value of the enum.
3. The middleware sets `permissionsContext` to the resulting `Set<Permission>`.
4. Loaders/actions read `context.get(permissionsContext)` and call `requirePermission(permissions, Permission.X)` (which redirects on failure) or `permissions.has(...)` for conditional UI.

The `_required` parameter on `requireAuth(_required: Permission[] = [])` is **retained for call-site compatibility but no longer used**. The set in `permissionsContext` is always the full granted set, so layout routes don't need to enumerate the permissions their children might check. New code may pass `[]`.

## Built-in roles

Defined by `BUILT_IN_ROLE_KEYS` in `app/shared/domain/built-in-roles.server.ts`:

- `member` — every current Member of the congregation (the broad fallback for programme eligibility)
- `ministry-school-student` — a Member who attends but isn't yet a publisher
- `publisher` — declared field-service publisher
- `baptized` — publisher with a `baptismDate`
- `brother` — baptized male (no longer publisher-gated, so a baptized non-publisher counts)
- `sister` — baptized female (same)
- `anointed` — publisher + baptized + `isAnointed`
- `elder` — baptized male + `isHelder`
- `assistant-servant` — baptized male + `isServant`
- `pioneer` — publisher + baptized + `type` is any pioneer type (i.e. not `normal` — permanent, auxiliary, special, or missionary). Compared against the `PublisherType` enum *names* the Prisma client returns, not the `@map`-ed DB strings

Membership is computed from `Member` flags (`isPublisher`, `type`, `isMale`, `baptismDate`, `isAnointed`, `isHelder`, `isServant`, `leftAt`) by `BUILT_IN_ROLE_PREDICATES`. After any change to those fields, call `syncBuiltInRoleAssignments(db, memberId, congregationId, actorId)` — it diffs the desired vs current `MemberRoleAssignment` rows and audits the change. When `Member.leftAt` is set, every predicate evaluates to `false`, so soft-leaving a member drops every identity role automatically.

### Member lifecycle audit actions

Lifecycle transitions on `Member` and the optional 1:1 `UserAccount` link emit dedicated audit actions (in addition to whatever `syncBuiltInRoleAssignments` records):

| Action key | Service | When |
|---|---|---|
| `MemberLeft` (`member.left`) | `setMemberLeft` | A Member is marked as having left. Identity-role assignments are dropped via the role-sync diff; if the Member has a linked `UserAccount`, every `UserRoleAssignment` (custom/management roles) on that account is dropped too — leaving means losing access. |
| `MemberReturned` (`member.returned`) | `setMemberReturned` | `leftAt` is cleared. Identity roles are re-attached from the still-intact flags; management roles on the linked account are NOT restored — they must be re-granted explicitly. |
| `AccountLinkedToMember` (`account.linked_to_member`) | `linkAccountToMember` | A login is added to an existing Member. A `UserAccount` row is created with an empty password, a fresh `PasswordResetToken` is generated, and the caller is expected to send the reset email. Throws `ConflictError` on duplicate email or pre-existing link. |
| `AccountUnlinkedFromMember` (`account.unlinked_from_member`) | `unlinkAccountFromMember` | The linked `UserAccount` is deleted. Tokens, permissions, and management role assignments cascade via FK `onDelete`. The Member row stays in place. |

Domain invariants are enforced at the database level via CHECK constraints on `Member`: a servant cannot also be an elder, anointed requires baptism, pioneer requires baptism, elder/servant require baptism + male. Code that would violate these throws on `INSERT`/`UPDATE`.

Built-in roles ship with **no permissions attached** (with one exception: `publisher` is granted `BoardViewer` by `seedBuiltInRoles`, mirroring the legacy default that publishers can read board documents). Their primary purpose is to label members for things like board section visibility and programme assignment filtering. Admins can attach permissions to built-in roles if they want them to grant access too.

Built-in roles cannot be renamed or deleted. Their identity is sourced from i18n via `getRoleDisplayName` (`app/shared/types/role.ts`).

## Custom roles

Created and edited through `app/shared/domain/roles.server.ts`:

- `createRole` — slugifies the name into a key, ensures uniqueness within the congregation, audits as `RoleCreated`
- `updateRoleIdentity` — edits name/description (forbidden on built-ins)
- `updateRolePermissions` → `syncRolePermissions` — diff-based add/remove on `RolePermission`, audits as `RolePermissionChanged`
- `addUserToRole` / `removeUserFromRole` / `setUserCustomRoleAssignments` — manage `UserRoleAssignment` for non-built-in roles (i.e. management roles on a `UserAccount`), audits as `UserRoleAssignmentChanged`
- `deleteRole` — forbidden on built-ins; cascades to memberships and permission rows

The corresponding routes live in `app/features/congregation/routes/roles/`.

## Event release / un-release authorization

Release and un-release actions do **not** get their own permission. They share the event-edit gate `canEditEvent` in `app/features/events/server/events-auth.server.ts`:

- **Program Manager** — can release/un-release any event
- **Template responsible** — the user set as `EventTemplate.responsible` can release/un-release events generated from that template (mirrors the existing edit + delete carve-out)
- **Admin** — everything (expanded from `Permission.Admin`)

The route handlers (`programs/events/release.tsx`, `unrelease.tsx`, `bulk-release.tsx`, `bulk-unrelease.tsx`) run authorization in Phase 1 of a two-phase pattern: a small scoped tx checks `canManageAnyProgram` and (for bulk) filters submitted IDs through `filterToManageableEventIds`. Phase 2 runs the mutation per-event via `withScope` and — for release only — fires the notifications *outside* the release tx (see [notifications.md](notifications.md#event-part-dispatch-gate)).

Bulk routes are hardened against cross-tenant probes: `filterToManageableEventIds` runs a `congregationId`-scoped `findMany` even for managers, so IDs from another tenant are silently dropped and logged as `warn` for triage. Non-manager drops (freeform events, unauthorized templates, cross-tenant IDs) are logged at `info` with counters split by reason.

## Emergency-information access (group-scoped)

Emergency-preparedness info (`features/publishers`) is the second place — after the activity *entry* form (`canManageMyGroupActivity`) — where access is **unioned from a global permission and a group scope**, and the pattern is worth calling out because it does *not* fit the pure permission model.

- **Global** — two ordinary permissions, `EmergencyInfoViewer` and `EmergencyInfoManager`, granted through roles. Congregation-wide.
- **Scoped, no permission entry** — a member who is the `responsibleFor` / `deputyFor` a group may view *and* edit the emergency info of members **of that group**. This is derived from group responsibility, not from any `Permission`, so it grants no role-editable entry.

The decision lives in pure functions in `app/features/publishers/model/emergency-access.ts` (`canViewEmergencyInfo` / `canManageEmergencyInfo`), which take `{ hasViewer, hasManager, myResponsibleGroupId, myDeputyGroupId, targetGroupId }`. Route loaders/actions (`routes/publishers/emergency.tsx`, the two `emergency-roster*` routes) resolve the caller's group responsibility off `currentAccountContext` (already eager-loaded) and re-check server-side. Because the scope isn't a permission, a group responsible who holds no publisher permission has no in-app nav entry to the roster today — they reach it via the per-group roster link on the group page.

## Adding a new permission

1. **Enum entry.** Add the new value to `Permission` in `app/shared/types/permission.ts`. Use `kebab-case` for the value (it's the DB key).
2. **Migration.** Insert a row into `Permission` for every existing congregation. Optionally pre-attach it to specific built-in roles via `RolePermission`. Use `prisma migrate diff` + a manual SQL file under `app/database/migrations/` (do not run `migrate dev` in CI).
3. **Display label.** Add a translated label in `app/shared/types/permission-display.ts` (or wherever the display map is referenced from the role-edit UI) and provide messages in `app/i18n/messages/{en,fr}.json` for the role-edit screen.
4. **Route guard.** In the loader/action that gates the new feature, call `requirePermission(permissions, Permission.X)` after `withScopeFromContext`. For UI gating, use `permissions.has(Permission.X)` to hide buttons/links.
5. **Tests.** Cover the new guard in unit tests for the route, and add an integration test for the resolver if the permission has any non-trivial assignment path.

Audit actions exist for every role/permission mutation already (`RoleCreated`, `RoleUpdated`, `RoleDeleted`, `RolePermissionChanged`, `UserRoleAssignmentChanged`, `UserPermissionsChanged`, `RoleAssignmentsSynced`). New permissions don't need new audit actions unless the user-facing action they gate is itself a new auditable event.

## Related

- [Architecture](architecture.md) — request flow and middleware
- [Row-Level Security](row-level-security.md) — the orthogonal tenant-isolation layer
- [Coding conventions](coding-conventions.md) — service-layer rules
