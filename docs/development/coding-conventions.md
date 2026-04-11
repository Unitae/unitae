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
├── ui/           # Feature-specific UI components
└── model/        # TypeScript type definitions
```

Not every feature uses every segment — only create what's needed.

### Shared Code

Cross-cutting utilities live in `app/shared/`:

```
app/shared/
├── libs/         # Database, Redis, logger, mailer, crypto, pagination, file storage, limits
├── types/        # Shared TypeScript types
└── ui/           # Shared UI components
```

### File Naming

| Pattern | Purpose |
|---------|---------|
| `*.server.ts` | Server-side only code |
| `*.routes.ts` | Route configuration files |
| `*.type.ts` | TypeScript type definitions |
| `*.server.test.ts` | Unit tests (co-located next to source) |
| `PascalCase.tsx` | React components |
| `camelCase.ts` | Utility functions |
| `*-queue.server.ts` | BullMQ queue definitions |
| `handle-*-work.server.ts` | Background job handlers |

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
- Service functions receive `db: ScopedDb` as their first parameter
- Route loaders/actions call `authenticateAndAuthorize()`, then delegate to service functions with the returned `db`

```typescript
// Good: service function with typed params
export async function findBuildingsPaginated(db: ScopedDb, page: number, territoryId: number) {
  return db.building.findMany({ where: { territoryId }, skip: (page - 1) * 20, take: 20 })
}

// Route action calls the service
export async function loader({ request }: Route.LoaderArgs) {
  const { db } = await authenticateAndAuthorize(request, [Role.ProspectionViewer])
  const buildings = await findBuildingsPaginated(db, page, territoryId)
  return { buildings }
}
```

## Database Patterns

### Scoped vs Unscoped

- **`db`** (from `authenticateAndAuthorize`) — Scoped to the current congregation. Use in all authenticated routes.
- **`unscopedDb`** — No scoping. Use for: login, password reset, setup, health check.
- **`createScopedDb(congregationId)`** — Creates a scoped client for non-route contexts (e.g., background workers).

### Congregation ID Placeholder

When creating records on scoped models, TypeScript requires `congregationId` at compile time, but the Prisma extension injects it at runtime. Use:

```typescript
db.territory.create({
  data: {
    name: 'Territory 1',
    congregationId: 0 as number, // Replaced at runtime by Prisma extension
  },
})
```

### Compound Unique Keys

`Setting` and `EventKind` have compound unique keys `[key, congregationId]`. Use `findFirst` instead of `findUnique`:

```typescript
// Good
db.setting.findFirst({ where: { key: 'bano-url' } })

// Bad — requires congregationId which the extension handles
db.setting.findUnique({ where: { key_congregationId: { key: 'bano-url', congregationId } } })
```

### Prisma CLI

- Run `pnpm prisma generate` after schema changes (generated client is gitignored)
- **Never use `prisma migrate dev`** — it requires interactive mode. Instead:
  1. Generate SQL: `pnpm prisma migrate diff --from-config-datasource --to-schema app/database/schema.prisma --script`
  2. Create migration directory manually: `mkdir -p app/database/migrations/{timestamp}_{name}`
  3. Save the SQL as `migration.sql` in that directory
  4. Apply: `pnpm prisma migrate deploy`

## Testing

### Philosophy

Tests are **black-box**: assert on observable outcomes (return values, thrown errors), not on implementation details.

- **Do** assert on what a function returns or throws
- **Don't** assert on mock call counts or `toHaveBeenCalledWith`
- Use **sentinel values** for negative tests (to prove the code path ran and returned `undefined`, rather than the test passing vacuously)

### Conventions

- Test files are co-located: `service.server.ts` → `service.server.test.ts`
- Mock external dependencies with `vi.mock()`: `db.server`, `redis.server`, `crypto.server`
- Set up mock return values, then assert on the function's result

```typescript
vi.mock('~/shared/libs/db.server')

test('returns null when territory not found', () => {
  vi.mocked(db.territory.findFirst).mockResolvedValue(null)

  const sentinel = Symbol('sentinel')
  let result: Territory | null = sentinel as any
  result = await findTerritory(db, 1)

  expect(result).toBeNull() // Sentinel proves this was set by the function
})
```

### Running Tests

```bash
pnpm test:unit              # Run once
pnpm test:unit:watch        # Watch mode
pnpm test:unit:coverage     # With coverage
```

## Language Conventions

| Context | Language |
|---------|----------|
| UI text (labels, messages, errors) | French |
| Code comments | French |
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
