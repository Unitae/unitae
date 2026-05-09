# Permissions and Roles

This page explains the authorization model that gates every authenticated route in the app: what a permission is, what a role is, how they're stored, how a user's effective set is resolved, and how to add a new permission.

For the end-user view of the same system, see the product doc: [Roles and Permissions](../product/roles-and-permissions.md).

## Two layers, distinct concepts

- **Permission** — the unit of access. A finite, code-defined enum (20 entries) declared in `app/shared/types/permission.ts`. New permissions require code + migration changes.
- **Role** — a named bundle of permissions assigned to users. Lives in the database (`Role` table), scoped to a congregation. Roles can be **built-in** (seeded, identity-stable) or **custom** (created at runtime by a Roles Manager).

Users do not hold permissions directly through roles only — there is also a direct `CongregationUserPermission` table for one-off grants. Both sources are unioned at request time.

## Where things live

| Concern | Path |
|---|---|
| Permission enum (source of truth) | `app/shared/types/permission.ts` |
| Built-in role keys + auto-assignment predicates | `app/shared/domain/built-in-roles.server.ts` |
| Custom role CRUD (create/update/delete, permission sync, user assignment) | `app/shared/domain/roles.server.ts` |
| Effective-permission resolver | `app/shared/auth/permissions.server.ts` |
| Auth middleware that runs the resolver | `app/shared/auth/middleware.server.ts` |
| Typed contexts (`userContext`, `congregationContext`, `permissionsContext`) | `app/shared/auth/route-context.server.ts` |
| Role admin UI | `app/features/congregation/routes/roles/` |
| User assignment UI | settings — see `app/features/settings/` |

Database schema is in `app/database/schema.prisma`. The relevant tables are `Permission`, `Role`, `RolePermission`, `UserRoleAssignment`, and `CongregationUserPermission`.

## Resolution flow

When a request hits an authenticated layout:

1. `requireAuth()` middleware runs (`app/shared/auth/middleware.server.ts`). It calls `verifySession`, then `resolveEffectivePermissions(userId, congregationId)`, then enforces GDPR consent.
2. `resolveEffectivePermissions` (`app/shared/auth/permissions.server.ts`) reads two sources in parallel:
   - direct grants from `CongregationUserPermission`
   - role-mediated grants from `RolePermission` joined to roles the user is a member of (`UserRoleAssignment`)
   It unions both, and if the result contains `Permission.Admin`, expands it to every value of the enum.
3. The middleware sets `permissionsContext` to the resulting `Set<Permission>`.
4. Loaders/actions read `context.get(permissionsContext)` and call `requirePermission(permissions, Permission.X)` (which redirects on failure) or `permissions.has(...)` for conditional UI.

The `_required` parameter on `requireAuth(_required: Permission[] = [])` is **retained for call-site compatibility but no longer used**. The set in `permissionsContext` is always the full granted set, so layout routes don't need to enumerate the permissions their children might check. New code may pass `[]`.

## Built-in roles

Defined by `BUILT_IN_ROLE_KEYS` in `app/shared/domain/built-in-roles.server.ts`:

- `male`, `female`, `publisher`, `baptized`, `anointed`, `elder`, `assistant-servant`

Membership is computed from boolean fields on the user (`isPublisher`, `isMale`, `baptismDate`, `isAnointed`, `isHelder`, `isServant`) by `BUILT_IN_ROLE_PREDICATES`. After any change to those fields, call `syncBuiltInRoleAssignments(db, userId, congregationId, actorId)` — it diffs the desired vs current `UserRoleAssignment` rows for built-in roles and audits the change.

Built-in roles ship with **no permissions attached**; their primary purpose is to label users for things like board section visibility and programme assignment filtering. Admins can attach permissions to built-in roles if they want them to grant access too.

Built-in roles cannot be renamed or deleted. Their identity is sourced from i18n via `getRoleDisplayName` (`app/shared/types/role.ts`).

## Custom roles

Created and edited through `app/shared/domain/roles.server.ts`:

- `createRole` — slugifies the name into a key, ensures uniqueness within the congregation, audits as `RoleCreated`
- `updateRoleIdentity` — edits name/description (forbidden on built-ins)
- `updateRolePermissions` → `syncRolePermissions` — diff-based add/remove on `RolePermission`, audits as `RolePermissionChanged`
- `addUserToRole` / `removeUserFromRole` / `setUserCustomRoleAssignments` — manage `UserRoleAssignment` for non-built-in roles, audits as `UserRoleAssignmentChanged`
- `deleteRole` — forbidden on built-ins; cascades to memberships and permission rows

The corresponding routes live in `app/features/congregation/routes/roles/`.

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
