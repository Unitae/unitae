# Coding Conventions

Patterns, philosophy, and rules for contributing to Unitae.

## Development Philosophy

### Pragmatic Over Academic

Unitae is a CRUD-heavy application. The architecture is deliberately simple:

```
Route loader/action → Service function → Prisma query
```

There is no hexagonal architecture, no ports and adapters, no repository interfaces. The app does not need that level of abstraction — it would add complexity without proportional benefit.

### Minimum Complexity

Write the minimum code needed for the current task:

- Three similar lines of code is better than a premature abstraction
- Don't create helpers or utilities for one-time operations
- Don't design for hypothetical future requirements
- Don't add configurability unless it's explicitly needed

### Don't Over-Engineer

When fixing a bug, fix the bug — don't refactor the surrounding code. When adding a feature, add the feature — don't add extra options "just in case."

- Don't add error handling for scenarios that can't happen
- Don't add validation for trusted internal data (only validate at system boundaries: user input, external APIs)
- Don't add feature flags or backwards-compatibility shims when you can just change the code

## Project Structure

### Feature-Based Architecture

Code is organized by feature under `app/features/`. Each feature owns all its code through consistent segments:

```
app/features/{feature}/
├── server/       # Server-side business logic and service functions
├── routes/       # Route components (referenced from app/routes.ts)
├── schemas/      # Conform + Zod form validation schemas
├── ui/           # Feature-specific UI components
└── model/        # TypeScript type definitions
```

Not every feature uses every segment — only create what's needed.

### Shared Code

Cross-cutting utilities live in `app/shared/`:

```
app/shared/
├── auth/         # Auth wrapper, crypto, sanitize-user, route context
├── domain/       # Congregation, limits, audit, settings, retention, host-settings, consent, setup
├── errors/       # AppError hierarchy (NotFoundError, ValidationError, ConflictError, etc.)
├── hooks/        # Shared React hooks
├── infra/        # Database, Redis, logger, mailer, file storage, queues
├── middleware/    # requireAuth middleware
├── types/        # Shared TypeScript types (role, entrance, publisher-type, setting keys)
├── ui/           # Shared UI components (shadcn/ui + custom)
└── utils/        # env, pagination, params, locale, cron, worker-locale, utils
```

### File Naming

| Pattern | Purpose |
|---------|---------|
| `*.server.ts` | Server-side only code (tree-shaken from client bundles) |
| `*.routes.ts` | Route configuration files |
| `*.type.ts` | TypeScript type definitions |
| `*.server.test.ts` | Unit tests (co-located next to source) |
| `*.integration.test.ts` | Integration tests (run against real database) |
| `PascalCase.tsx` | React components |
| `camelCase.ts` | Utility functions |
| `*-queue.server.ts` | BullMQ queue definitions |
| `handle-*-work.server.ts` | Background job handlers |

**Important**: All files in `features/*/server/` directories must use the `.server.ts` suffix. This tells React Router's bundler to exclude them from client bundles. The only exception is pure functions that are intentionally shared with client route components (e.g., `compute-territory-quantity.ts`).

## Code Style

Enforced by [Biome](https://biomejs.dev/). Run `pnpm build:format` to auto-fix.

| Rule | Value |
|------|-------|
| Quotes (JS) | Single quotes |
| Quotes (JSX) | Double quotes |
| Line width | 120 characters |
| Trailing commas | Everywhere |
| Semicolons | As needed (ASI) |
| Indentation | Spaces |
| Naming | `useNamingConvention` enforced |
| Console | `noConsole` — use the Winston logger |

**Biome suppression**: Prisma compound keys (e.g., `key_congregationId`) and AWS SDK properties (e.g., `Bucket`, `Key`) violate naming conventions. Suppress with `biome-ignore lint/style/useNamingConvention`.

## Service Layer Pattern

Business logic belongs in **service functions** (`features/*/server/*.server.ts`), not in route loaders or actions.

### Rules

- Service functions take **typed parameters**, never the `Request` object
- Service functions receive `db: TransactionClient` as their first parameter (from `app/shared/infra/db.server`)
- Route loaders/actions use `withScopeFromContext(context, async db => {...})` then delegate to service functions
- The `requireAuth` middleware (applied via layout route) sets `userContext`, `congregationContext`, and `permissionsContext` on the route context
- **Route files must NOT contain `db.*.create()`, `db.*.update()`, `db.*.delete()`, or `db.*.deleteMany()` calls directly.** All write operations go through service functions.

```typescript
// Service function with typed params
export async function createPublisher(db: TransactionClient, congregation: CongregationInfo, params: CreatePublisherParams) {
  const limits = new LimitService(db, congregation)
  await limits.errorIfWouldGoOverLimit('publishers')
  return db.user.create({ data: { ... } })
}

// Route action delegates to service (middleware already set context)
export async function action({ request, context }: Route.ActionArgs) {
  const congregation = context.get(congregationContext)
  const form = await request.formData()
  return withScopeFromContext(context, async db => {
    const user = await createPublisher(db, congregation, { firstname, lastname, ... })
    return redirect(`/congregation/publishers/${user.id}/edit`)
  })
}
```

### Cross-Feature Import Rule

Files in `app/features/X/server/` **must not** import from `app/features/Y/server/` where X ≠ Y. Cross-feature data needs go through `app/shared/`. Type-only imports (`import type`) from other features are allowed.

## Database Patterns

### Scoped vs Unscoped

- **`withScopeFromContext(context, fn)`** — Reads `congregationId` from route context and wraps `fn` in a `$transaction` with `SET LOCAL app.congregation_id` for PostgreSQL RLS. Preferred in authenticated routes (middleware sets the context).
- **`withScope(congregationId, fn)`** — Same as above but takes `congregationId` explicitly. Use when route context is not available (e.g., background jobs).
- **`unscopedDb`** — Same PrismaClient, no `SET LOCAL`. RLS permits all rows. Use for: login, password reset, setup, health check, platform admin, audit logging, email sending.
- **`db` and `unscopedDb`** are the same instance. The distinction is semantic only. Tenant isolation happens via `SET LOCAL` inside `withScope`, not via a different client.

### Congregation ID Placeholder

When creating records on scoped models, TypeScript requires `congregationId` at compile time, but RLS handles isolation at runtime. Use:

```typescript
db.territory.create({
  data: {
    name: 'Territory 1',
    congregationId: 0 as number, // RLS handles actual scoping
  },
})
```

### Compound Unique Keys

`Setting` and `EventKind` have compound unique keys `[key, congregationId]`. Use `findFirst` instead of `findUnique`:

```typescript
// Good
db.setting.findFirst({ where: { key: 'bano-url' } })

// Bad — requires explicit congregationId
db.setting.findUnique({ where: { key_congregationId: { key: 'bano-url', congregationId } } })
```

### Prisma CLI

- Run `pnpm prisma generate` after schema changes (generated client is gitignored)
- **Never use `prisma migrate dev`** — it requires interactive mode. Instead:
  1. Generate SQL: `pnpm prisma migrate diff --from-config-datasource --to-schema app/database/schema.prisma --script`
  2. Create migration directory manually: `mkdir -p app/database/migrations/{timestamp}_{name}`
  3. Save the SQL as `migration.sql` in that directory
  4. Apply: `pnpm prisma migrate deploy`

## Error Handling

Service functions signal expected failures by **throwing typed error classes** from `app/shared/errors/app-error.server.ts`:

- `AppError` — Abstract base class with `code` and `statusCode` properties
- `NotFoundError` — 404, entity not found
- `ValidationError` — 400, with field name
- `ConflictError` — 409, duplicate or conflicting state
- `ForbiddenError` — 403, insufficient permissions
- `LimitReachedError` — 429, congregation limit reached (publishers, territories, users, storage)

Route actions catch these and convert them to user-facing responses (redirect with flash message). Unexpected errors (DB down, network issues) bubble up to the error boundary.

## Testing

### Philosophy

Tests are **black-box**: assert on observable outcomes (return values, thrown errors), not on implementation details.

- **Do** assert on what a function returns or throws
- **Prefer** return-value assertions over spy assertions
- **Acceptable**: `toHaveBeenCalledWith` for verifying correct argument delegation (e.g., ensuring a filter parameter is passed to the database query)
- Use **sentinel values** for negative tests (to prove the code path ran and returned `undefined`, rather than the test passing vacuously)

### Test Types

| Type | Pattern | Runner | When to use |
|------|---------|--------|-------------|
| Unit | `*.server.test.ts` | `pnpm test:unit` | Service functions, utilities, pure logic |
| Integration | `*.integration.test.ts` | `pnpm test:integration` | Database interactions, RLS isolation, multi-step workflows |
| E2E | `tests/e2e/*.spec.ts` | `pnpm test:e2e` | Critical user flows (login, create publisher, upload document) |
| Boundaries | n/a | `pnpm test:boundaries` | Cross-feature import rule enforcement |

### Conventions

- Test files are co-located: `service.server.ts` → `service.server.test.ts`
- Mock external dependencies with `vi.mock()`: `db.server`, `redis.server`, `crypto.server`
- Set up mock return values, then assert on the function's result
- Test descriptions are in English

```typescript
vi.mock('~/shared/infra/db.server')

test('returns null when territory not found', () => {
  vi.mocked(db.territory.findFirst).mockResolvedValue(null)

  const sentinel = Symbol('sentinel')
  let result: Territory | null = sentinel as any
  result = await findTerritory(db, 1)

  expect(result).toBeNull()
})
```

## Language Conventions

| Context | Language |
|---------|----------|
| UI text (labels, messages, errors) | French (as default translation) |
| Code comments | English |
| Test descriptions | English |
| Commit messages | English |
| Pull request descriptions | English |
| Documentation | English |

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add territory PDF export with map page
fix: correct pagination offset in building list
refactor: extract sync progress tracking into helper
docs: add open data sync documentation
```

## What NOT to Do

- Don't add docstrings, comments, or type annotations to code you didn't change
- Don't add error handling for impossible scenarios
- Don't create helpers or abstractions for one-time operations
- Don't add backwards-compatibility shims — just change the code
- Don't add `// removed` comments for deleted code — delete it completely
- Don't rename unused variables to `_var` — remove them
- Don't re-export types "for convenience" — import from the source
- Don't put `db.*.create/update/delete` calls in route files — use service functions
- Don't import from `features/X/server/` in `features/Y/server/` — use `shared/`
