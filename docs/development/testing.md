# Testing

## Test Types

Unitae uses three layers of tests, each with its own configuration and runner.

| Type | Runner | Config | File pattern | Command |
|------|--------|--------|--------------|---------|
| Unit | Vitest | `vitest.config.ts` | `*.test.ts` (co-located) | `pnpm test:unit` |
| Integration | Vitest | `app/tests/vitest.config.integration.ts` | `*.integration.test.ts` | `pnpm test:integration` |
| E2E | Playwright | `app/tests/playwright.config.ts` | `app/tests/e2e/*.spec.ts` | `pnpm test:e2e` |
| Boundaries | ESLint | `eslint.config.js` | — | `pnpm test:boundaries` |

## Commands

```bash
pnpm test:unit              # Run unit tests once
pnpm test:unit:watch        # Watch mode
pnpm test:unit:coverage     # With v8 coverage report (targets app/**/*.server.ts)
pnpm test:integration       # Integration tests (requires running PostgreSQL)
pnpm test:e2e               # Playwright headless
pnpm test:e2e:headed        # Playwright with visible browser
pnpm test:boundaries        # Cross-feature import rule checks
pnpm test:lint              # Biome lint
pnpm test:typecheck         # react-router typegen + tsc
```

## Unit Tests

Unit tests are co-located next to their source files (e.g., `change-user-password.server.ts` → `change-user-password.server.test.ts`).

### Configuration

- Environment: `node` (no DOM)
- Path alias: `~` → `./app`
- Excludes `*.integration.test.ts` files
- Coverage targets only `app/**/*.server.ts`, excluding `app/database/**` and routes

### Patterns

**Mocking dependencies:**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Account-bound services (auth, tokens, audit) mock `userAccount`.
vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { userAccount: { findUnique: vi.fn(), update: vi.fn() } },
}))

// Member-bound services (publishers, attributions, activities, programme
// assignments) mock `member` instead.
vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { member: { findMany: vi.fn() } },
}))

vi.mock('~/shared/auth/crypto.server', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}))
```

**Black-box assertions** — assert on observable outcomes (return values, thrown errors), not spy call counts:

```typescript
it('should throw NotFoundError when user does not exist', async () => {
  vi.mocked(db.userAccount.findUnique).mockResolvedValue(null)
  await expect(changePassword(params)).rejects.toThrow(NotFoundError)
})
```

**Mocking Paraglide messages:**

```typescript
vi.mock('~/i18n/paraglide/messages', () => ({
  dashboard_urgent_territory_overdue: ({ number }: { number: string }) =>
    `Territory ${number} — overdue`,
}))
```

**Testing client hooks** — Vitest runs in `node` environment. Mock `react` and `react-router` entirely. Shim `globalThis.window` for browser APIs. Suppress `biome-ignore lint/correctness/useHookAtTopLevel` in test helpers.

### Reset mocks between tests

```typescript
beforeEach(() => {
  vi.resetAllMocks()
})
```

## Integration Tests

Integration tests run against a real PostgreSQL database. They use a separate Vitest config with a 30-second timeout.

### Prerequisites

PostgreSQL must be running (start with `docker compose -f docker/docker-compose.dev.yml up -d`).

### Configuration

- Config: `app/tests/vitest.config.integration.ts`
- File pattern: `*.integration.test.ts`
- Path alias: `~` → `./app`
- Extended timeout: 30s

### The database these run against

Integration tests write into — and in places truncate — the database they are pointed at, so the
suite refuses to start unless **every** URL it can reach names a disposable test database. The
check lives in `app/tests/assert-test-database.ts` and runs from `setupFiles`.

Both variables are checked, and they must name the same database:

| Variable | Used by | Why it is checked |
|---|---|---|
| `DB_URL` | migration suites (a migration runs as the schema owner) | the obvious one |
| `DB_RUNTIME_URL` | everything else, via `DB_RUNTIME_URL ?? DB_URL` | RLS is only exercised as the non-superuser role |

`DB_RUNTIME_URL` is the one that bites. It is often exported from a shell profile and left
pointing at the development database, so `DB_URL=…/unitae_test pnpm test:integration` looks safe
while nearly every write still lands in development. That is how a working database ends up full
of `Roles Other 1788220863373` fixtures, which then surface in the app itself because
single-tenant mode assumes exactly one congregation row.

A database name qualifies when it carries a `test` token delimited by start, end, `_` or `-`, so
`unitae_test` and `my-test-db` pass while `latest` and `unitae_dev` do not. CI already uses
`unitae_test`, so nothing changes there.

Setting one up locally, mirroring what CI does:

```bash
createdb unitae_test    # or: docker exec <postgres> psql -U unitae -d postgres -c 'CREATE DATABASE unitae_test'
export DB_URL="postgresql://unitae:unitae@localhost:5432/unitae_test"
export DB_RUNTIME_URL="postgresql://unitae_app:<password>@localhost:5432/unitae_test"
pnpm prisma migrate deploy && pnpm prisma db seed
pnpm test:integration
```

Omitting `DB_RUNTIME_URL` entirely is allowed — the suite then connects as the superuser — but the
RLS suites fail, because row-level security does not apply to the table owner.

### Patterns

Integration tests use real Prisma queries with RLS scoping:

```typescript
import { PrismaClient } from '~/database/generated/client'

const db = new PrismaClient()

beforeAll(async () => {
  // Create test data
})

afterAll(async () => {
  // Clean up test data
  await db.$disconnect()
})

it('should return scoped results', async () => {
  const result = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${congregationId}'`)
    return someFunctionUnderTest(tx)
  })
  expect(result).toEqual(...)
})
```

## E2E Tests

End-to-end tests use Playwright with Chromium.

### Configuration

- Config: `app/tests/playwright.config.ts`
- Test directory: `app/tests/e2e/`
- Base URL: `http://localhost:5173` (or `E2E_BASE_URL` env var)
- Retries: 1 in CI, 0 locally
- Trace: on first retry
- Auto-starts `pnpm start:dev` if not already running

### Helpers

Shared helpers live in `app/tests/e2e/helpers/`:

```typescript
// auth.ts — reusable login helper
import { login } from './helpers/auth'

test('should display dashboard', async ({ page }) => {
  await login(page, 'admin@test.com', 'password')
  await expect(page.getByRole('heading', { name: /tableau de bord/i })).toBeVisible()
})
```

## Boundary Checks

`pnpm test:boundaries` runs ESLint with `eslint-plugin-boundaries` to enforce cross-feature import rules. Features must not import from each other's `server/` directories directly — shared code goes in `app/shared/`.

## Related

- [Coding Conventions](coding-conventions.md) — Code style and patterns
- [Architecture](architecture.md) — System design context
