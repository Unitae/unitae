# Row-Level Security (RLS)

Unitae uses **PostgreSQL Row-Level Security** to enforce tenant isolation at the database level. Each congregation's data is invisible to other congregations, even if application code has a bug.

## How It Works

### The Problem

Unitae is multi-tenant: multiple congregations share the same PostgreSQL database. Every tenant-scoped table has a `congregationId` column. Without RLS, a bug in a query (missing `WHERE congregationId = ...`) could leak data across congregations.

### The Solution

RLS moves the isolation guarantee from the application layer down to the database engine. PostgreSQL itself filters rows before they reach the application.

```
┌─────────────────────────────────────────────────────────────┐
│                        Application                          │              
│                                                             │
│      SET LOCAL app.congregation_id                          │──── sets context for the transaction
│      SELECT * FROM "User"                                   │──── no WHERE needed, RLS filters
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                        PostgreSQL                           │
│                                                             │
│               RLS policy checks every row:                  │
│  "congregationId" = current_setting('app.congregation_id')  │
│                                                             │
│               Only matching rows are returned               │
└─────────────────────────────────────────────────────────────┘
```

### Two Database Roles

RLS policies are bypassed by PostgreSQL superusers. To make RLS effective, the application uses **two database roles**:

| Role | Superuser | Used by | Purpose |
|------|-----------|---------|---------|
| `unitae` | Yes | Migrations, seed, backup | Schema changes (DDL), `pg_dump` |
| `unitae_app` | No | Web server, worker | Runtime queries — RLS is enforced |

The application reads `DATABASE_APP_URL` for the runtime connection. If not set, it falls back to `DATABASE_URL` (for backwards compatibility with single-role setups, but RLS will not be enforced if the role is a superuser).

## RLS Policy

Every tenant-scoped table has the same policy:

```sql
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "User" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );
```

**Behavior:**

| `app.congregation_id` | Rows visible | When |
|------------------------|-------------|------|
| Not set / empty | All rows | Login, setup, health check |
| Set to a value | Only rows matching that congregation | Normal authenticated requests |

The `true` parameter in `current_setting(...)` makes it return `NULL` instead of throwing an error when the variable is not set. `NULLIF(..., '')` converts empty strings to `NULL`, so both cases are handled by the single `IS NULL` check.

> **Why `CASE` instead of `OR`?** PostgreSQL does not guarantee left-to-right short-circuit evaluation of `OR` in RLS policies. The query optimizer may reorder conditions. After a `SET LOCAL` transaction ends, pool connections retain `app.congregation_id = ''`. If PostgreSQL evaluates `''::int` before the `IS NULL` guard, the cast fails with `invalid input syntax for type integer: ""`. `CASE` guarantees sequential evaluation: the `::int` cast only runs in the `ELSE` branch when the value is a non-empty string.

## Tables with RLS

**Tenant-scoped (RLS enforced):**

Attribution, AuditLog, BoardDocument, BoardDynamicDocumentSettings, BoardSection, Building, BuildingAccess, BuildingEntrance, BuildingResidentialData, ConsentRecord, CongregationUserRole, DataDeletionRecord, Event, EventKind, NotificationEvent, NotificationPreference, ProgrammePartAssignment, ProgrammeServiceRoleAssignment, ProgrammeTemplate, ProgrammeTemplatePart, ProgrammeTemplateResponsible, ProgrammeTemplateServiceRole, PublisherActivity, PublisherGroup, Setting, Territory, User

**Global (no RLS):**

Congregation, UserRole, PasswordResetToken, EmailVerificationToken, BoardDocumentVersion, BoardDynamicDocumentView

## Application Integration

### Setting the Scope

The `withScope` function in `app/shared/infra/db.server.ts` opens a transaction and sets the congregation context:

```typescript
function withScope<T>(congregationId: number, fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}
```

`SET LOCAL` is transaction-scoped — it is automatically rolled back when the transaction ends. This prevents congregation context from leaking across requests through the connection pool.

### In Route Loaders and Actions

Authenticated routes use `withScopeFromContext`, which reads the congregation from the middleware context:

```typescript
export async function loader({ context }: Route.LoaderArgs) {
  return withScopeFromContext(context, async db => {
    // All queries here are automatically scoped by RLS
    return getPublishers(db, congregationId)
  })
}
```

### Unscoped Access

Some operations need to see all rows across congregations. These run **outside** `withScope`:

- **Login** — must find the user by email regardless of congregation
- **Setup / onboarding** — no congregation exists yet
- **Health check** — system-level, no tenant context
- **Platform admin** — cross-congregation management
- **Password reset** — token lookup is global

In these cases, use `db` or `unscopedDb` directly (they are the same instance). Since `app.congregation_id` is not set, the RLS policy allows all rows.

## Development Setup

The dev Docker Compose creates both roles automatically via an init script (`docker/init-db/01-create-app-role.sql`). To use the non-superuser role locally:

1. Set `DATABASE_APP_URL` in your `.env`:

   ```ini
   DATABASE_URL="postgresql://unitae:unitae@localhost:5432/unitae_dev"
   DATABASE_APP_URL="postgresql://unitae_app:unitae_app@localhost:5432/unitae_dev"
   ```

2. If your database volume already exists (created before the init script was added), reset it:

   ```bash
   docker compose -f docker/docker-compose.dev.yml down -v
   docker compose -f docker/docker-compose.dev.yml up -d
   pnpm prisma migrate deploy
   pnpm prisma db seed
   ```

### Verifying RLS Works

Connect as `unitae_app` and test scoped queries:

```bash
docker compose -f docker/docker-compose.dev.yml exec postgres \
  psql -U unitae_app -d unitae_dev -c "
    BEGIN;
    SET LOCAL app.congregation_id = '1';
    SELECT id, firstname, \"congregationId\" FROM \"User\";
    COMMIT;
  "
```

Only users from congregation 1 should appear. Without `SET LOCAL`, all users are visible.

## Adding RLS to a New Table

When creating a new tenant-scoped table with a `congregationId` column, add RLS in the same migration:

```sql
ALTER TABLE "NewTable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NewTable" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "NewTable" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );
```

> **Never use `OR` with `::int` casts in RLS policies.** Always use `CASE` to guard the cast. See the "RLS Policy" section above for the rationale.

The `unitae_app` role automatically gets DML privileges on new tables thanks to `ALTER DEFAULT PRIVILEGES` set up in the `20260425100000_add_app_database_role` migration.

## Self-Hosting Considerations

Self-hosted users deploying with a single database role (superuser) will see a warning at startup:

```
DATABASE_APP_URL is not set — RLS enforcement requires a non-superuser database role.
```

The application works correctly without `DATABASE_APP_URL` — tenant isolation still relies on `withScope` at the application level. However, for defense-in-depth, self-hosters should create a non-superuser role:

```sql
CREATE ROLE unitae_app LOGIN PASSWORD 'your-secure-password' NOSUPERUSER;
GRANT USAGE ON SCHEMA public TO unitae_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO unitae_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO unitae_app;
```

Then set `DATABASE_APP_URL` in the environment to use this role for the runtime.
