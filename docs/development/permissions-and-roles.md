# Permissions and Roles

This page explains the authorization model that gates every authenticated route in the app: what a permission is, what a role is, how they're stored, how a user's effective set is resolved, and how to add a new permission.

For the end-user view of the same system, see the product doc: [Roles and Permissions](../product/roles-and-permissions.md).

## Two layers, distinct concepts

- **Permission** — the unit of access. A finite, code-defined enum (24 entries) declared in `app/shared/types/permission.ts`. New permissions require code + migration changes.
- **Role** — a named bundle of permissions. Lives in the database (`Role` table), scoped to a congregation. Roles can be **built-in** (seeded, identity-stable, auto-synced from `Member` flags) or **custom** (created at runtime by a Roles Manager and assigned to a `UserAccount`).

Built-in identity roles attach to **`Member`** via `MemberRoleAssignment`. Custom roles (and the management permissions they grant) attach to **`UserAccount`** via `UserRoleAssignment`. The two tables are siblings: identity ("you are an elder") vs access ("you can manage roles").

Roles are the **only** carrier of a permission. The former `CongregationUserPermission` table, which let an admin grant a permission to one user directly, was migrated into roles and dropped in #149 — so the role screens are the single place access is granted. See [Role kinds](#role-kinds) below.

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

Database schema is in `app/database/schema.prisma`. The relevant tables are `Permission`, `Role`, `RolePermission`, `UserRoleAssignment` (custom/management roles, on `UserAccount`) and `MemberRoleAssignment` (built-in identity roles, on `Member`).

## Resolution flow

When a request hits an authenticated layout:

1. `requireAuth()` middleware runs (`app/shared/auth/middleware.server.ts`). It calls `verifySession`, then `resolveEffectivePermissions(userId, congregationId)`, then enforces GDPR consent.
2. `resolveEffectivePermissions` (`app/shared/auth/permissions.server.ts`) reads `RolePermission` joined to every role the account reaches — via `UserRoleAssignment` (custom/management roles on the `UserAccount`) or `MemberRoleAssignment` (identity roles on the linked `Member`). If the result contains `Permission.Admin`, it expands to every value of the enum.
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

## Role kinds

Three kinds of role exist, and the difference that matters is **who attaches them**, not
the `isBuiltIn` flag — that flag only answers "can this be renamed or deleted".

| Kind | Keys | `isBuiltIn` | Attaches to | Managed by |
|---|---|---|---|---|
| Identity | `BUILT_IN_ROLE_KEYS` (`member`, `publisher`, `elder`, …) | `true` | `Member` | `syncBuiltInRoleAssignments`, from Member flags |
| System | `SYSTEM_ROLE_KEYS` (`admin`) | `true` | `UserAccount` | granted by hand |
| Custom | whatever an admin creates | `false` | `UserAccount` | granted by hand |

Both lists live in `app/shared/domain/built-in-roles.server.ts`, alongside
`isIdentityRoleKey()` — prefer that helper over reading `isBuiltIn` when the question is
"does this attach to the Member or the account".

Two consequences are easy to get wrong:

- **`syncBuiltInRoleAssignments` selects by key list, not by `isBuiltIn`.** A role with no
  predicate is treated as "not desired" and its assignment deleted, so matching on the flag
  would silently strip `admin` on the next Member sync.
- **Account-assignable means custom *or* system.** `setUserCustomRoleAssignments` filters on
  `isBuiltIn: false OR key IN SYSTEM_ROLE_KEYS`; filtering on the flag alone makes `admin`
  impossible to grant through the UI.

`admin` carries `Permission.Admin`, which `resolveEffectivePermissions` expands to every
permission. It is seeded into every congregation by `seedBuiltInRoles`, which is also why an
admin can never create a custom role that collides with the key — `createRole` rejects a
duplicate key.

### The auto-role interlude

Migration `20260826000000_drop_direct_user_permissions` turned every direct grant into its
own single-permission role keyed `can-<verb>-<subject>`. That was a mistake: one role per
permission re-encodes the permission table as roles and leaves an admin staring at two dozen
synthetic entries. `20260826120000_replace_auto_roles_with_admin_role` undid it — the
`can-do-anything` role became the `admin` system role, and every other auto-role was deleted
together with the access it carried.

That deletion was a deliberate revocation, safe only because no live congregation had run the
earlier migration. `importCongregationUserPermissions` mirrors it for archives exported before
the cutover: an `admin` grant lands on the `admin` role, and every other legacy grant is
dropped with a warning naming it.

## Adding a new permission

1. **Enum entry.** Add the new value to `Permission` in `app/shared/types/permission.ts`. Use `can-<verb>-<object>` in `kebab-case` for the value (it's the DB key). Permissions are named for what a person can do, not for a job title — the authorisation screen reads as a list of capabilities.
2. **Migration.** Insert a row into `Permission` for every existing congregation. Optionally pre-attach it to specific built-in roles via `RolePermission`. Use `prisma migrate diff` + a manual SQL file under `app/database/migrations/` (do not run `migrate dev` in CI).
3. **Display label.** Add a translated label in `app/shared/types/permission-display.ts` (or wherever the display map is referenced from the role-edit UI) and provide messages in `app/i18n/messages/{en,fr}.json` for the role-edit screen.
4. **Route guard.** In the loader/action that gates the new feature, call `requirePermission(permissions, Permission.X)` after `withScopeFromContext`. For UI gating, use `permissions.has(Permission.X)` to hide buttons/links.
5. **Dependency, if any.** If the screen this unlocks cannot function without another permission, add an entry to `PERMISSION_REQUIRES` in `permission.ts`. The picker then tells the admin; nothing is auto-granted and nothing is blocked. Keep the map short — a long one means the split was wrong.
6. **Tests.** Cover the new guard in unit tests for the route, and add an integration test for the resolver if the permission has any non-trivial assignment path.

`pnpm test:permission-coverage` enforces steps 3, 4 and 5: it fails when a permission gates nothing, when either message catalogue lacks its description, or when `PERMISSION_REQUIRES` names something that is not a permission. A permission an admin can tick but which enforces nothing promises a restriction the app does not apply.

Audit actions exist for every role/permission mutation already (`RoleCreated`, `RoleUpdated`, `RoleDeleted`, `RolePermissionChanged`, `UserRoleAssignmentChanged`, `UserPermissionsChanged`, `RoleAssignmentsSynced`). New permissions don't need new audit actions unless the user-facing action they gate is itself a new auditable event.

## Related

- [Architecture](architecture.md) — request flow and middleware
- [Row-Level Security](row-level-security.md) — the orthogonal tenant-isolation layer
- [Coding conventions](coding-conventions.md) — service-layer rules
